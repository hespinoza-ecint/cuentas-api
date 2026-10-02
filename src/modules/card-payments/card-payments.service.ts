import { Injectable } from '@nestjs/common';
import { CardPayment } from '@prisma/client';
import {
  ConflictError,
  NotFoundError,
  UnprocessableEntityError,
} from '../../common/errors/http-errors';
import { RequestMeta } from '../../common/http/request-meta';
import { statementStatusFor } from '../../domain/cards/card-cycle';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CardLedgerService } from '../card-ledger/card-ledger.service';
import { CardsService } from '../cards/cards.service';
import { StatementsService } from '../cards/statements.service';
import { LedgerService } from '../ledger/ledger.service';
import { FinancialDatePolicy } from '../ledger/financial-date.policy';
import {
  CreateCardPaymentDto,
  ListCardPaymentsQueryDto,
  ReverseCardPaymentDto,
} from './dto/card-payment.dto';
import {
  CardPaymentsRepository,
  CardPaymentWithDetails,
} from './repositories/card-payments.repository';

export interface PaginatedCardPayments {
  data: CardPaymentWithDetails[];
  meta: { limit: number; nextCursor: string | null; hasMore: boolean };
}

@Injectable()
export class CardPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: CardPaymentsRepository,
    private readonly cardsService: CardsService,
    private readonly statements: StatementsService,
    private readonly ledger: LedgerService,
    private readonly cardLedger: CardLedgerService,
    private readonly datePolicy: FinancialDatePolicy,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string, query: ListCardPaymentsQueryDto): Promise<PaginatedCardPayments> {
    const limit = query.limit ?? 20;
    const { items, nextCursor } = await this.payments.list(userId, query, limit);
    return { data: items, meta: { limit, nextCursor, hasMore: nextCursor !== null } };
  }

  async get(userId: string, id: string): Promise<CardPaymentWithDetails> {
    const payment = await this.payments.findById(userId, id);
    if (!payment) {
      throw new NotFoundError('El pago no existe.', { reason: 'PAYMENT_NOT_FOUND' });
    }
    return payment;
  }

  /**
   * Pago de tarjeta: descuenta de la cuenta de efectivo, abona al libro de la
   * tarjeta y aplica el monto a los cortes exigibles (RN-23).
   */
  async create(
    userId: string,
    dto: CreateCardPaymentDto,
    meta: RequestMeta,
  ): Promise<{ payment: CardPayment; allocations: Array<{ targetType: string; amount: number }> }> {
    const card = await this.cardsService.get(userId, dto.creditCardId);

    if (card.status !== 'ACTIVE') {
      throw new UnprocessableEntityError('La tarjeta esta inactiva.', { reason: 'CARD_INACTIVE' });
    }
    if (card.currentBalance <= 0) {
      throw new UnprocessableEntityError('La tarjeta no tiene saldo pendiente.', {
        reason: 'CARD_WITHOUT_BALANCE',
      });
    }
    if (dto.amount > card.currentBalance) {
      throw new UnprocessableEntityError('El pago excede el saldo actual de la tarjeta.', {
        reason: 'PAYMENT_EXCEEDS_BALANCE',
      });
    }

    const account = await this.prisma.cashAccount.findFirst({
      where: { id: dto.cashAccountId, userId, deletedAt: null },
    });
    if (!account) {
      throw new NotFoundError('La cuenta de efectivo no existe.', { reason: 'ACCOUNT_NOT_FOUND' });
    }
    if (account.status !== 'ACTIVE') {
      throw new UnprocessableEntityError('La cuenta de efectivo esta inactiva.', {
        reason: 'ACCOUNT_INACTIVE',
      });
    }

    await this.ledger.assertDateAllowed(userId, dto.paymentDate);

    // Materializa los cortes ya ocurridos para poder asignar el pago.
    await this.statements.sync(userId, card.id);

    return this.prisma.$transaction(async (tx) => {
      const cashMovement = await this.ledger.postMovement(
        {
          userId,
          cashAccountId: account.id,
          type: 'CARD_PAYMENT',
          amount: -dto.amount,
          occurredOn: dto.paymentDate,
          description: `Pago tarjeta ${card.alias} ****${card.last4}`,
          sourceType: 'CardPayment',
          createdById: userId,
        },
        tx,
      );

      const cardEntry = await this.cardLedger.postEntry(
        {
          userId,
          creditCardId: card.id,
          type: 'PAYMENT',
          amount: -dto.amount,
          occurredOn: dto.paymentDate,
          description: `Pago de tarjeta ${card.alias}`,
          sourceType: 'CardPayment',
          createdById: userId,
        },
        tx,
      );

      const payment = await tx.cardPayment.create({
        data: {
          userId,
          creditCardId: card.id,
          cashAccountId: account.id,
          cashMovementId: cashMovement.id,
          cardLedgerEntryId: cardEntry.id,
          amount: dto.amount,
          paymentDate: dto.paymentDate,
          status: 'APPLIED',
          notes: dto.notes,
        },
      });

      const { allocations, firstStatementId } = await this.statements.applyPaymentAllocations(
        userId,
        card.id,
        payment.id,
        dto.amount,
        tx,
      );

      const hasRevolving = allocations.some(
        (allocation) => allocation.targetType === 'REVOLVING',
      );

      const updated = await tx.cardPayment.update({
        where: { id: payment.id },
        data: {
          statementId: firstStatementId,
          type: hasRevolving ? 'PARTIAL' : 'STATEMENT',
        },
      });

      await tx.cashMovement.update({
        where: { id: cashMovement.id },
        data: { sourceId: payment.id },
      });
      await tx.cardLedgerEntry.update({
        where: { id: cardEntry.id },
        data: { sourceId: payment.id },
      });

      await this.audit.record(
        {
          action: 'card_payment.created',
          entityType: 'CardPayment',
          entityId: payment.id,
          userId,
          actorUserId: userId,
          changes: {
            creditCardId: card.id,
            cashAccountId: account.id,
            amount: dto.amount,
            paymentDate: dto.paymentDate,
            allocations: allocations.map((allocation) => ({
              targetType: allocation.targetType,
              amount: allocation.amount,
            })),
          },
          ...meta,
        },
        tx,
      );

      return {
        payment: updated,
        allocations: allocations.map((allocation) => ({
          targetType: allocation.targetType,
          amount: allocation.amount,
        })),
      };
    });
  }

  async reverse(
    userId: string,
    id: string,
    dto: ReverseCardPaymentDto,
    meta: RequestMeta,
  ): Promise<CardPayment> {
    const payment = await this.payments.findRaw(userId, id);
    if (!payment) {
      throw new NotFoundError('El pago no existe.', { reason: 'PAYMENT_NOT_FOUND' });
    }
    if (payment.status === 'REVERSED') {
      throw new ConflictError('El pago ya fue revertido.', { reason: 'PAYMENT_ALREADY_REVERSED' });
    }

    const today = await this.datePolicy.today(userId);

    return this.prisma.$transaction(async (tx) => {
      await this.cardLedger.reverseEntry(userId, payment.cardLedgerEntryId, userId, tx);
      await this.ledger.reverseMovement(userId, payment.cashMovementId, dto.reason, userId, tx);

      for (const allocation of payment.allocations) {
        if (!allocation.statementId) {
          continue;
        }

        const statement = await tx.cardStatement.findUnique({
          where: { id: allocation.statementId },
        });
        if (!statement) {
          continue;
        }

        const paidAmount = Math.max(statement.paidAmount - allocation.amount, 0);
        const amountToAvoidInterest =
          statement.noInterestPaymentReported ?? statement.noInterestPaymentCalc;

        await tx.cardStatement.update({
          where: { id: statement.id },
          data: {
            paidAmount,
            status: statementStatusFor(
              amountToAvoidInterest,
              paidAmount,
              statement.dueDate,
              today,
            ),
          },
        });
      }

      const updated = await tx.cardPayment.update({
        where: { id: payment.id },
        data: { status: 'REVERSED' },
      });

      await this.audit.record(
        {
          action: 'card_payment.reversed',
          entityType: 'CardPayment',
          entityId: payment.id,
          userId,
          actorUserId: userId,
          changes: { reason: dto.reason, amount: payment.amount },
          ...meta,
        },
        tx,
      );

      return updated;
    });
  }
}
