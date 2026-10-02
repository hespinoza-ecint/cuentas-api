import { Injectable } from '@nestjs/common';
import { CardPayment, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export type CardPaymentWithDetails = Prisma.CardPaymentGetPayload<{
  include: {
    creditCard: { select: { id: true; alias: true; last4: true } };
    cashAccount: { select: { id: true; name: true } };
    allocations: true;
  };
}>;

@Injectable()
export class CardPaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    filters: { creditCardId?: string; cursor?: string },
    limit: number,
  ): Promise<{ items: CardPaymentWithDetails[]; nextCursor: string | null }> {
    const cursor = filters.cursor
      ? await this.prisma.cardPayment.findFirst({ where: { id: filters.cursor, userId } })
      : null;

    const items = await this.prisma.cardPayment.findMany({
      where: {
        userId,
        ...(filters.creditCardId ? { creditCardId: filters.creditCardId } : {}),
        ...(cursor ? { createdAt: { lt: cursor.createdAt } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        creditCard: { select: { id: true, alias: true, last4: true } },
        cashAccount: { select: { id: true, name: true } },
        allocations: true,
      },
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    return { items: page, nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null };
  }

  findById(userId: string, id: string): Promise<CardPaymentWithDetails | null> {
    return this.prisma.cardPayment.findFirst({
      where: { id, userId },
      include: {
        creditCard: { select: { id: true, alias: true, last4: true } },
        cashAccount: { select: { id: true, name: true } },
        allocations: true,
      },
    });
  }

  findRaw(userId: string, id: string): Promise<(CardPayment & { allocations: { statementId: string | null; installmentId: string | null; amount: number }[] }) | null> {
    return this.prisma.cardPayment.findFirst({
      where: { id, userId },
      include: { allocations: { select: { statementId: true, installmentId: true, amount: true } } },
    });
  }
}
