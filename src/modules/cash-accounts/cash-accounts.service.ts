import { Injectable } from '@nestjs/common';
import { CashAccount } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  ConflictError,
  NotFoundError,
  UnprocessableEntityError,
} from '../../common/errors/http-errors';
import { RequestMeta } from '../../common/http/request-meta';
import { ClockService } from '../../infrastructure/clock/clock.module';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LedgerService, RecalculateResult } from '../ledger/ledger.service';
import {
  CreateCashAccountDto,
  OpeningBalanceDto,
  TransferDto,
  UpdateCashAccountDto,
} from './dto/cash-account.dto';
import { CashAccountsRepository } from './repositories/cash-accounts.repository';

@Injectable()
export class CashAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: CashAccountsRepository,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
  ) {}

  list(userId: string): Promise<CashAccount[]> {
    return this.accounts.list(userId);
  }

  async get(userId: string, id: string): Promise<CashAccount> {
    const account = await this.accounts.findById(userId, id);
    if (!account) {
      throw new NotFoundError('La cuenta de efectivo no existe.', { reason: 'ACCOUNT_NOT_FOUND' });
    }
    return account;
  }

  async create(
    userId: string,
    dto: CreateCashAccountDto,
    meta: RequestMeta,
  ): Promise<CashAccount> {
    const today = await this.today(userId);

    return this.prisma.$transaction(async (tx) => {
      const count = await this.accounts.countForUser(userId);
      const isDefault = dto.isDefault ?? count === 0;
      if (isDefault) {
        await this.accounts.unsetDefault(userId, null, tx);
      }

      const account = await this.accounts.create(
        {
          userId,
          name: dto.name,
          type: dto.type ?? 'CASH',
          isSpendable: dto.isSpendable ?? true,
          isDefault,
          currency: 'MXN',
        },
        tx,
      );

      if (dto.openingBalance) {
        await this.ledger.postMovement(
          {
            userId,
            cashAccountId: account.id,
            type: 'OPENING_BALANCE',
            amount: dto.openingBalance,
            occurredOn: dto.openingDate ?? today,
            description: 'Saldo inicial',
            createdById: userId,
          },
          tx,
        );
      }

      const created = await tx.cashAccount.findUniqueOrThrow({ where: { id: account.id } });

      await this.audit.record(
        {
          action: 'cash_account.created',
          entityType: 'CashAccount',
          entityId: account.id,
          userId,
          actorUserId: userId,
          changes: { name: created.name, openingBalance: dto.openingBalance ?? 0 },
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
    dto: UpdateCashAccountDto,
    meta: RequestMeta,
  ): Promise<CashAccount> {
    const account = await this.get(userId, id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await this.accounts.unsetDefault(userId, id, tx);
      }

      const updated = await this.accounts.update(
        id,
        {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.isSpendable !== undefined ? { isSpendable: dto.isSpendable } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
        tx,
      );

      await this.audit.record(
        {
          action: 'cash_account.updated',
          entityType: 'CashAccount',
          entityId: id,
          userId,
          actorUserId: userId,
          changes: {
            before: { name: account.name, isSpendable: account.isSpendable, status: account.status },
            after: dto,
          },
          ...meta,
        },
        tx,
      );

      return updated;
    });
  }

  async remove(userId: string, id: string, meta: RequestMeta): Promise<void> {
    const account = await this.get(userId, id);

    if (account.currentBalance !== 0) {
      throw new UnprocessableEntityError(
        'La cuenta tiene saldo distinto de cero. Transfiere o ajusta el saldo antes de eliminarla.',
        { reason: 'ACCOUNT_WITH_BALANCE' },
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.accounts.update(id, { deletedAt: new Date(), isDefault: false }, tx);

      if (account.isDefault) {
        const next = (await this.accounts.list(userId)).find((entry) => entry.id !== id);
        if (next) {
          await this.accounts.update(next.id, { isDefault: true }, tx);
        }
      }

      await this.audit.record(
        {
          action: 'cash_account.deleted',
          entityType: 'CashAccount',
          entityId: id,
          userId,
          actorUserId: userId,
          ...meta,
        },
        tx,
      );
    });
  }

  /** El saldo inicial solo puede registrarse una vez por cuenta (RN-05). */
  async setOpeningBalance(
    userId: string,
    id: string,
    dto: OpeningBalanceDto,
    meta: RequestMeta,
  ): Promise<{ account: CashAccount; movementId: string }> {
    await this.get(userId, id);

    if (await this.accounts.hasOpeningBalance(id)) {
      throw new ConflictError('La cuenta ya tiene saldo inicial registrado.', {
        reason: 'OPENING_BALANCE_EXISTS',
      });
    }

    const today = await this.today(userId);
    const occurredOn = dto.occurredOn ?? today;

    const movementId = await this.prisma.$transaction(async (tx) => {
      const movement = await this.ledger.postMovement(
        {
          userId,
          cashAccountId: id,
          type: 'OPENING_BALANCE',
          amount: dto.amount,
          occurredOn,
          description: 'Saldo inicial',
          createdById: userId,
        },
        tx,
      );

      await this.audit.record(
        {
          action: 'cash_account.opening_balance_set',
          entityType: 'CashAccount',
          entityId: id,
          userId,
          actorUserId: userId,
          changes: { amount: dto.amount, occurredOn },
          ...meta,
        },
        tx,
      );

      return movement.id;
    });

    return { account: await this.get(userId, id), movementId };
  }

  async transfer(
    userId: string,
    dto: TransferDto,
    meta: RequestMeta,
  ): Promise<{ transferId: string; outMovementId: string; inMovementId: string }> {
    if (dto.fromAccountId === dto.toAccountId) {
      throw new UnprocessableEntityError('Las cuentas de origen y destino deben ser diferentes.', {
        reason: 'SAME_ACCOUNT',
      });
    }

    const [from, to] = await Promise.all([
      this.get(userId, dto.fromAccountId),
      this.get(userId, dto.toAccountId),
    ]);

    const transferId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const out = await this.ledger.postMovement(
        {
          userId,
          cashAccountId: from.id,
          type: 'TRANSFER_OUT',
          amount: -dto.amount,
          occurredOn: dto.occurredOn,
          description: dto.description ?? `Transferencia a ${to.name}`,
          sourceType: 'Transfer',
          sourceId: transferId,
          createdById: userId,
        },
        tx,
      );

      const incoming = await this.ledger.postMovement(
        {
          userId,
          cashAccountId: to.id,
          type: 'TRANSFER_IN',
          amount: dto.amount,
          occurredOn: dto.occurredOn,
          description: dto.description ?? `Transferencia desde ${from.name}`,
          sourceType: 'Transfer',
          sourceId: transferId,
          createdById: userId,
        },
        tx,
      );

      await this.audit.record(
        {
          action: 'cash_account.transferred',
          entityType: 'Transfer',
          entityId: transferId,
          userId,
          actorUserId: userId,
          changes: {
            fromAccountId: from.id,
            toAccountId: to.id,
            amount: dto.amount,
            occurredOn: dto.occurredOn,
          },
          ...meta,
        },
        tx,
      );

      return { transferId, outMovementId: out.id, inMovementId: incoming.id };
    });
  }

  recalculate(userId: string, id: string, meta: RequestMeta): Promise<RecalculateResult> {
    return this.ledger.recalculate(userId, id, meta);
  }

  private async today(userId: string): Promise<string> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
    return this.clock.today(settings?.timezone ?? 'America/Mexico_City');
  }
}
