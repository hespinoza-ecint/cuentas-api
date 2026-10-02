import { Injectable } from '@nestjs/common';
import { CashMovement } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export interface ListMovementsFilters {
  cashAccountId?: string;
  type?: string;
  from?: string;
  to?: string;
  cursor?: string;
}

@Injectable()
export class CashMovementsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    filters: ListMovementsFilters,
    limit: number,
  ): Promise<{ items: CashMovement[]; nextCursor: string | null }> {
    const cursorMovement = filters.cursor
      ? await this.prisma.cashMovement.findFirst({ where: { id: filters.cursor, userId } })
      : null;

    const items = await this.prisma.cashMovement.findMany({
      where: {
        userId,
        ...(filters.cashAccountId ? { cashAccountId: filters.cashAccountId } : {}),
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.from || filters.to
          ? {
              occurredOn: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
        ...(cursorMovement ? { createdAt: { lt: cursorMovement.createdAt } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    return {
      items: page,
      nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null,
    };
  }

  findById(userId: string, id: string): Promise<CashMovement | null> {
    return this.prisma.cashMovement.findFirst({ where: { id, userId } });
  }
}
