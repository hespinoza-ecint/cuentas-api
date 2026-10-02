import { Injectable } from '@nestjs/common';
import { CardLedgerEntry, Prisma } from '@prisma/client';
import {
  ConflictError,
  NotFoundError,
  UnprocessableEntityError,
} from '../../common/errors/http-errors';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { FinancialDatePolicy } from '../ledger/financial-date.policy';

export interface PostCardEntryInput {
  userId: string;
  creditCardId: string;
  type: string;
  /** Monto con signo en centavos (positivo = aumenta la deuda). Nunca cero. */
  amount: number;
  occurredOn: string;
  description: string;
  sourceType?: string;
  sourceId?: string;
  statementId?: string;
  reversesEntryId?: string;
  createdById: string;
}

type PrismaClientLike = Prisma.TransactionClient | PrismaService;

/**
 * Libro de la tarjeta: unica puerta de entrada para crear cargos/abonos y
 * mantener la cache de saldo y credito disponible.
 */
@Injectable()
export class CardLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly datePolicy: FinancialDatePolicy,
  ) {}

  async postEntry(
    input: PostCardEntryInput,
    tx?: Prisma.TransactionClient,
  ): Promise<CardLedgerEntry> {
    const client: PrismaClientLike = tx ?? this.prisma;

    if (!Number.isInteger(input.amount) || input.amount === 0) {
      throw new UnprocessableEntityError('El monto del movimiento debe ser un entero distinto de cero.', {
        reason: 'INVALID_ENTRY_AMOUNT',
      });
    }

    const card = await client.creditCard.findFirst({
      where: { id: input.creditCardId, userId: input.userId, deletedAt: null },
    });
    if (!card) {
      throw new NotFoundError('La tarjeta de credito no existe.', { reason: 'CARD_NOT_FOUND' });
    }
    if (card.status !== 'ACTIVE') {
      throw new UnprocessableEntityError('La tarjeta esta inactiva.', { reason: 'CARD_INACTIVE' });
    }

    await this.datePolicy.assertAllowed(input.userId, input.occurredOn);

    const entry = await client.cardLedgerEntry.create({
      data: {
        userId: input.userId,
        creditCardId: input.creditCardId,
        statementId: input.statementId,
        reversesEntryId: input.reversesEntryId,
        type: input.type,
        amount: input.amount,
        occurredOn: input.occurredOn,
        description: input.description,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        createdById: input.createdById,
      },
    });

    const newBalance = card.currentBalance + input.amount;
    await client.creditCard.update({
      where: { id: card.id },
      data: {
        currentBalance: newBalance,
        availableCredit: card.creditLimit - newBalance,
        balanceVersion: { increment: 1 },
      },
    });

    return entry;
  }

  async reverseEntry(
    userId: string,
    entryId: string,
    createdById: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CardLedgerEntry> {
    const client: PrismaClientLike = tx ?? this.prisma;

    const original = await client.cardLedgerEntry.findFirst({
      where: { id: entryId, userId },
      include: { reversedBy: { select: { id: true } } },
    });

    if (!original) {
      throw new NotFoundError('El movimiento de la tarjeta no existe.', {
        reason: 'ENTRY_NOT_FOUND',
      });
    }
    if (original.type === 'REVERSAL') {
      throw new UnprocessableEntityError('Un reverso no puede revertirse.', {
        reason: 'CANNOT_REVERSE_REVERSAL',
      });
    }
    if (original.reversedBy) {
      throw new ConflictError('El movimiento ya fue revertido.', { reason: 'ALREADY_REVERSED' });
    }

    return this.postEntry(
      {
        userId,
        creditCardId: original.creditCardId,
        type: 'REVERSAL',
        amount: -original.amount,
        occurredOn: await this.datePolicy.today(userId),
        description: `Reverso de: ${original.description}`,
        sourceType: 'Reversal',
        sourceId: original.id,
        reversesEntryId: original.id,
        createdById,
      },
      tx,
    );
  }
}
