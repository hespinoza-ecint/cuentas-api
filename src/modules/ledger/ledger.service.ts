import { Injectable } from '@nestjs/common';
import { CashMovement, Prisma } from '@prisma/client';
import {
  ConflictError,
  NotFoundError,
  UnprocessableEntityError,
} from '../../common/errors/http-errors';
import { RequestMeta } from '../../common/http/request-meta';
import { compareLocalDates, daysBetween } from '../../domain/shared/local-date';
import { ClockService } from '../../infrastructure/clock/clock.module';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface PostMovementInput {
  userId: string;
  cashAccountId: string;
  type: string;
  /** Monto con signo en centavos (positivo = entra dinero). Nunca cero. */
  amount: number;
  occurredOn: string;
  description: string;
  reason?: string;
  sourceType?: string;
  sourceId?: string;
  reversesMovementId?: string;
  createdById: string;
}

export interface RecalculateResult {
  accountId: string;
  storedBalance: number;
  calculatedBalance: number;
  matches: boolean;
  corrected: boolean;
  movementCount: number;
}

type PrismaClientLike = Prisma.TransactionClient | PrismaService;

/**
 * Libro de efectivo: unica puerta de entrada para crear movimientos y
 * actualizar la cache del saldo (RN-05). Los servicios de gastos, ingresos y
 * transferencias lo usan dentro de sus propias transacciones.
 */
@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly audit: AuditService,
  ) {}

  async assertDateAllowed(userId: string, occurredOn: string): Promise<void> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
    const timeZone = settings?.timezone ?? 'America/Mexico_City';
    const backdateLimit = settings?.backdateLimitDays ?? 60;
    const today = this.clock.today(timeZone);

    if (compareLocalDates(occurredOn, today) > 0) {
      throw new UnprocessableEntityError(
        'No se pueden registrar movimientos con fecha futura. Los flujos futuros se capturan como ingresos o gastos programados.',
        { reason: 'FUTURE_DATE_NOT_ALLOWED' },
      );
    }

    if (daysBetween(occurredOn, today) > backdateLimit) {
      throw new UnprocessableEntityError(
        `La fecha excede el limite de ${backdateLimit} dias hacia atras.`,
        { reason: 'BACKDATE_LIMIT_EXCEEDED' },
      );
    }
  }

  async postMovement(
    input: PostMovementInput,
    tx?: Prisma.TransactionClient,
  ): Promise<CashMovement> {
    const client: PrismaClientLike = tx ?? this.prisma;

    if (!Number.isInteger(input.amount) || input.amount === 0) {
      throw new UnprocessableEntityError('El monto del movimiento debe ser un entero distinto de cero.', {
        reason: 'INVALID_MOVEMENT_AMOUNT',
      });
    }

    const account = await client.cashAccount.findFirst({
      where: { id: input.cashAccountId, userId: input.userId, deletedAt: null },
    });
    if (!account) {
      throw new NotFoundError('La cuenta de efectivo no existe.', { reason: 'ACCOUNT_NOT_FOUND' });
    }
    if (account.status !== 'ACTIVE') {
      throw new UnprocessableEntityError('La cuenta de efectivo esta inactiva.', {
        reason: 'ACCOUNT_INACTIVE',
      });
    }

    await this.assertDateAllowed(input.userId, input.occurredOn);

    const movement = await client.cashMovement.create({
      data: {
        userId: input.userId,
        cashAccountId: input.cashAccountId,
        type: input.type,
        amount: input.amount,
        occurredOn: input.occurredOn,
        description: input.description,
        reason: input.reason,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        reversesMovementId: input.reversesMovementId,
        createdById: input.createdById,
      },
    });

    // Cache del saldo: se actualiza en la misma transaccion que el movimiento.
    await client.cashAccount.update({
      where: { id: account.id },
      data: {
        currentBalance: { increment: input.amount },
        balanceVersion: { increment: 1 },
      },
    });

    return movement;
  }

  async reverseMovement(
    userId: string,
    movementId: string,
    reason: string,
    createdById: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CashMovement> {
    const client = tx ?? this.prisma;

    const original = await client.cashMovement.findFirst({
      where: { id: movementId, userId },
      include: { reversedBy: { select: { id: true } } },
    });

    if (!original) {
      throw new NotFoundError('El movimiento no existe.', { reason: 'MOVEMENT_NOT_FOUND' });
    }
    if (original.type === 'REVERSAL') {
      throw new UnprocessableEntityError('Un reverso no puede revertirse.', {
        reason: 'CANNOT_REVERSE_REVERSAL',
      });
    }
    if (original.reversedBy) {
      throw new ConflictError('El movimiento ya fue revertido.', { reason: 'ALREADY_REVERSED' });
    }

    return this.postMovement(
      {
        userId,
        cashAccountId: original.cashAccountId,
        type: 'REVERSAL',
        amount: -original.amount,
        occurredOn: this.clock.today((await this.getTimeZone(userId))),
        description: `Reverso de: ${original.description}`,
        reason,
        sourceType: 'Reversal',
        sourceId: original.id,
        reversesMovementId: original.id,
        createdById,
      },
      tx,
    );
  }

  /**
   * Recalcula el saldo sumando el libro completo y corrige la cache si hay
   * diferencias. Toda correccion queda auditada.
   */
  async recalculate(userId: string, accountId: string, meta: RequestMeta = {}): Promise<RecalculateResult> {
    const account = await this.prisma.cashAccount.findFirst({
      where: { id: accountId, userId, deletedAt: null },
    });
    if (!account) {
      throw new NotFoundError('La cuenta de efectivo no existe.', { reason: 'ACCOUNT_NOT_FOUND' });
    }

    const aggregate = await this.prisma.cashMovement.aggregate({
      where: { userId, cashAccountId: accountId },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const calculatedBalance = aggregate._sum.amount ?? 0;
    const matches = calculatedBalance === account.currentBalance;

    await this.prisma.cashAccount.update({
      where: { id: accountId },
      data: {
        currentBalance: calculatedBalance,
        balanceVersion: matches ? undefined : { increment: 1 },
        lastReconciledAt: new Date(),
      },
    });

    if (!matches) {
      await this.audit.record({
        action: 'cash_account.recalculated',
        entityType: 'CashAccount',
        entityId: accountId,
        userId,
        actorUserId: userId,
        changes: { storedBalance: account.currentBalance, calculatedBalance },
        ...meta,
      });
    }

    return {
      accountId,
      storedBalance: account.currentBalance,
      calculatedBalance,
      matches,
      corrected: !matches,
      movementCount: aggregate._count._all,
    };
  }

  private async getTimeZone(userId: string): Promise<string> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
    return settings?.timezone ?? 'America/Mexico_City';
  }
}
