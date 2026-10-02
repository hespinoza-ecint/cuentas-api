import { Injectable } from '@nestjs/common';
import { CreditCard } from '@prisma/client';
import {
  BadRequestError,
  NotFoundError,
  UnprocessableEntityError,
} from '../../common/errors/http-errors';
import { RequestMeta } from '../../common/http/request-meta';
import { DEFAULT_DUE_DAYS_AFTER_CUT } from '../../domain/cards/card-cycle';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CardLedgerService } from '../card-ledger/card-ledger.service';
import { FinancialDatePolicy } from '../ledger/financial-date.policy';
import {
  CreateCardDto,
  ReconcileCardDto,
  UpdateCardDto,
} from './dto/card.dto';
import { CardsRepository } from './repositories/cards.repository';

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cards: CardsRepository,
    private readonly cardLedger: CardLedgerService,
    private readonly datePolicy: FinancialDatePolicy,
    private readonly audit: AuditService,
  ) {}

  list(userId: string): Promise<CreditCard[]> {
    return this.cards.list(userId);
  }

  async get(userId: string, id: string): Promise<CreditCard> {
    const card = await this.cards.findById(userId, id);
    if (!card) {
      throw new NotFoundError('La tarjeta de credito no existe.', { reason: 'CARD_NOT_FOUND' });
    }
    return card;
  }

  async create(userId: string, dto: CreateCardDto, meta: RequestMeta): Promise<CreditCard> {
    const today = await this.datePolicy.today(userId);
    const dueDateMode = dto.dueDateMode ?? 'DAYS_AFTER_CUT';

    if (dueDateMode === 'FIXED_DAY' && !dto.dueDay) {
      throw new BadRequestError('dueDay es obligatorio cuando dueDateMode es FIXED_DAY.', {
        reason: 'DUE_DAY_REQUIRED',
      });
    }

    const openingBalance = dto.openingBalance ?? 0;

    return this.prisma.$transaction(async (tx) => {
      const card = await this.cards.create(
        {
          userId,
          alias: dto.alias,
          institution: dto.institution,
          last4: dto.last4,
          creditLimit: dto.creditLimit,
          annualRateBps: dto.annualRateBps ?? 0,
          annualFee: dto.annualFee,
          annualFeeMonth: dto.annualFeeMonth,
          cutDay: dto.cutDay,
          dueDateMode,
          dueDay: dto.dueDay,
          dueDaysAfterCut:
            dueDateMode === 'DAYS_AFTER_CUT'
              ? (dto.dueDaysAfterCut ?? DEFAULT_DUE_DAYS_AFTER_CUT)
              : null,
          dueNonBusinessDayRule: dto.dueNonBusinessDayRule ?? 'PREVIOUS',
          sameDayCutIncluded: dto.sameDayCutIncluded ?? true,
          currentBalance: 0,
          availableCredit: dto.creditLimit,
        },
        tx,
      );

      if (openingBalance > 0) {
        await this.cardLedger.postEntry(
          {
            userId,
            creditCardId: card.id,
            type: 'OPENING_BALANCE',
            amount: openingBalance,
            occurredOn: dto.openingDate ?? today,
            description: 'Saldo inicial',
            createdById: userId,
          },
          tx,
        );
      }

      const created = await tx.creditCard.findUniqueOrThrow({ where: { id: card.id } });

      await this.audit.record(
        {
          action: 'credit_card.created',
          entityType: 'CreditCard',
          entityId: card.id,
          userId,
          actorUserId: userId,
          changes: {
            alias: dto.alias,
            creditLimit: dto.creditLimit,
            cutDay: dto.cutDay,
            openingBalance,
          },
          ...meta,
        },
        tx,
      );

      return created;
    });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateCardDto,
    meta: RequestMeta,
  ): Promise<CreditCard> {
    const card = await this.get(userId, id);

    if (dto.creditLimit !== undefined && dto.creditLimit < card.currentBalance) {
      throw new UnprocessableEntityError('El limite no puede ser menor al saldo actual.', {
        reason: 'LIMIT_BELOW_BALANCE',
      });
    }

    const dueDateMode = dto.dueDateMode ?? card.dueDateMode;
    const dueDay = dto.dueDay ?? card.dueDay;
    if (dueDateMode === 'FIXED_DAY' && !dueDay) {
      throw new BadRequestError('dueDay es obligatorio cuando dueDateMode es FIXED_DAY.', {
        reason: 'DUE_DAY_REQUIRED',
      });
    }

    const updated = await this.cards.update(id, {
      ...(dto.alias !== undefined ? { alias: dto.alias } : {}),
      ...(dto.institution !== undefined ? { institution: dto.institution } : {}),
      ...(dto.creditLimit !== undefined
        ? {
            creditLimit: dto.creditLimit,
            availableCredit: dto.creditLimit - card.currentBalance,
          }
        : {}),
      ...(dto.annualRateBps !== undefined ? { annualRateBps: dto.annualRateBps } : {}),
      ...(dto.annualFee !== undefined ? { annualFee: dto.annualFee } : {}),
      ...(dto.annualFeeMonth !== undefined ? { annualFeeMonth: dto.annualFeeMonth } : {}),
      ...(dto.cutDay !== undefined ? { cutDay: dto.cutDay } : {}),
      ...(dto.dueDateMode !== undefined ? { dueDateMode: dto.dueDateMode } : {}),
      ...(dto.dueDay !== undefined ? { dueDay: dto.dueDay } : {}),
      ...(dto.dueDaysAfterCut !== undefined ? { dueDaysAfterCut: dto.dueDaysAfterCut } : {}),
      ...(dto.dueNonBusinessDayRule !== undefined
        ? { dueNonBusinessDayRule: dto.dueNonBusinessDayRule }
        : {}),
      ...(dto.sameDayCutIncluded !== undefined
        ? { sameDayCutIncluded: dto.sameDayCutIncluded }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    });

    await this.audit.record({
      action: 'credit_card.updated',
      entityType: 'CreditCard',
      entityId: id,
      userId,
      actorUserId: userId,
      changes: {
        before: {
          alias: card.alias,
          creditLimit: card.creditLimit,
          cutDay: card.cutDay,
          status: card.status,
        },
        after: dto,
      },
      ...meta,
    });

    return updated;
  }

  async remove(userId: string, id: string, meta: RequestMeta): Promise<void> {
    const card = await this.get(userId, id);

    if (card.currentBalance !== 0) {
      throw new UnprocessableEntityError(
        'La tarjeta tiene saldo pendiente. Liquídala antes de eliminarla.',
        { reason: 'CARD_WITH_BALANCE' },
      );
    }

    await this.cards.update(id, { deletedAt: new Date(), status: 'INACTIVE' });

    await this.audit.record({
      action: 'credit_card.deleted',
      entityType: 'CreditCard',
      entityId: id,
      userId,
      actorUserId: userId,
      ...meta,
    });
  }

  /**
   * RN-15: conciliacion contra el estado de cuenta del banco. La diferencia
   * se registra como un cargo/abono de ajuste sobre el libro de la tarjeta.
   */
  async reconcile(
    userId: string,
    id: string,
    dto: ReconcileCardDto,
    meta: RequestMeta,
  ): Promise<{ card: CreditCard; difference: number; adjusted: boolean; entryId: string | null }> {
    const card = await this.get(userId, id);
    const difference = dto.reportedBalance - card.currentBalance;

    if (difference === 0) {
      await this.audit.record({
        action: 'credit_card.reconciled',
        entityType: 'CreditCard',
        entityId: id,
        userId,
        actorUserId: userId,
        changes: { reportedBalance: dto.reportedBalance, difference: 0, adjusted: false },
        ...meta,
      });
      return { card, difference: 0, adjusted: false, entryId: null };
    }

    const entry = await this.prisma.$transaction((tx) =>
      this.cardLedger.postEntry(
        {
          userId,
          creditCardId: id,
          type: 'ADJUSTMENT',
          amount: difference,
          occurredOn: dto.asOfDate,
          description: `Conciliacion con estado de cuenta: ${dto.reason}`,
          sourceType: 'Reconciliation',
          createdById: userId,
        },
        tx,
      ),
    );

    await this.audit.record({
      action: 'credit_card.reconciled',
      entityType: 'CreditCard',
      entityId: id,
      userId,
      actorUserId: userId,
      changes: {
        before: card.currentBalance,
        reportedBalance: dto.reportedBalance,
        difference,
        adjusted: true,
        entryId: entry.id,
      },
      ...meta,
    });

    return {
      card: await this.get(userId, id),
      difference,
      adjusted: true,
      entryId: entry.id,
    };
  }
}
