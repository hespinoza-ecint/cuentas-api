import { Injectable } from '@nestjs/common';
import { CardLedgerEntry, CardStatement, CreditCard, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

@Injectable()
export class CardsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string): Promise<CreditCard[]> {
    return this.prisma.creditCard.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  findById(
    userId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CreditCard | null> {
    const client = tx ?? this.prisma;
    return client.creditCard.findFirst({ where: { id, userId, deletedAt: null } });
  }

  create(
    data: Prisma.CreditCardUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<CreditCard> {
    const client = tx ?? this.prisma;
    return client.creditCard.create({ data });
  }

  update(
    id: string,
    data: Prisma.CreditCardUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<CreditCard> {
    const client = tx ?? this.prisma;
    return client.creditCard.update({ where: { id }, data });
  }

  findStatement(cardId: string, cutDate: string): Promise<CardStatement | null> {
    return this.prisma.cardStatement.findUnique({
      where: { creditCardId_cutDate: { creditCardId: cardId, cutDate } },
    });
  }

  findStatementById(
    userId: string,
    cardId: string,
    statementId: string,
  ): Promise<CardStatement | null> {
    return this.prisma.cardStatement.findFirst({
      where: { id: statementId, userId, creditCardId: cardId },
    });
  }

  listStatements(userId: string, cardId: string): Promise<CardStatement[]> {
    return this.prisma.cardStatement.findMany({
      where: { userId, creditCardId: cardId },
      orderBy: { cutDate: 'desc' },
    });
  }

  /** Estados con saldo exigible pendiente, del mas antiguo al mas reciente (RN-23). */
  listOutstandingStatements(userId: string, cardId: string): Promise<CardStatement[]> {
    return this.prisma.cardStatement.findMany({
      where: { userId, creditCardId: cardId, status: { not: 'PAID' } },
      orderBy: { cutDate: 'asc' },
    });
  }

  createStatement(
    data: Prisma.CardStatementUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<CardStatement> {
    const client = tx ?? this.prisma;
    return client.cardStatement.create({ data });
  }

  updateStatement(
    id: string,
    data: Prisma.CardStatementUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<CardStatement> {
    const client = tx ?? this.prisma;
    return client.cardStatement.update({ where: { id }, data });
  }

  async sumAllocations(statementId: string): Promise<number> {
    const result = await this.prisma.paymentAllocation.aggregate({
      where: { statementId, cardPayment: { status: 'APPLIED' } },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  }

  async listLedger(
    userId: string,
    cardId: string,
    filters: { type?: string; from?: string; to?: string; cursor?: string },
    limit: number,
  ): Promise<{ items: CardLedgerEntry[]; nextCursor: string | null }> {
    const cursor = filters.cursor
      ? await this.prisma.cardLedgerEntry.findFirst({ where: { id: filters.cursor, userId } })
      : null;

    const items = await this.prisma.cardLedgerEntry.findMany({
      where: {
        userId,
        creditCardId: cardId,
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.from || filters.to
          ? {
              occurredOn: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
        ...(cursor ? { createdAt: { lt: cursor.createdAt } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    return { items: page, nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null };
  }

  aggregateEntries(userId: string, cardId: string): Promise<{ _sum: { amount: number | null } }> {
    return this.prisma.cardLedgerEntry.aggregate({
      where: { userId, creditCardId: cardId },
      _sum: { amount: true },
    });
  }
}
