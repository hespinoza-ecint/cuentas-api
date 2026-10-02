import { Injectable } from '@nestjs/common';
import { CashAccount, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

/**
 * Acceso a cuentas de efectivo. Todas las consultas filtran por userId;
 * un recurso de otro usuario simplemente no existe.
 */
@Injectable()
export class CashAccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string): Promise<CashAccount[]> {
    return this.prisma.cashAccount.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  findById(
    userId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CashAccount | null> {
    const client = tx ?? this.prisma;
    return client.cashAccount.findFirst({ where: { id, userId, deletedAt: null } });
  }

  countForUser(userId: string): Promise<number> {
    return this.prisma.cashAccount.count({ where: { userId, deletedAt: null } });
  }

  create(data: Prisma.CashAccountUncheckedCreateInput, tx?: Prisma.TransactionClient): Promise<CashAccount> {
    const client = tx ?? this.prisma;
    return client.cashAccount.create({ data });
  }

  update(
    id: string,
    data: Prisma.CashAccountUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<CashAccount> {
    const client = tx ?? this.prisma;
    return client.cashAccount.update({ where: { id }, data });
  }

  async unsetDefault(
    userId: string,
    exceptId: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.cashAccount.updateMany({
      where: {
        userId,
        isDefault: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { isDefault: false },
    });
  }

  async hasOpeningBalance(accountId: string): Promise<boolean> {
    const count = await this.prisma.cashMovement.count({
      where: { cashAccountId: accountId, type: 'OPENING_BALANCE' },
    });
    return count > 0;
  }
}
