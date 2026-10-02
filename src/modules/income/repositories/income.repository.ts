import { Injectable } from '@nestjs/common';
import { IncomeSchedule, IncomeTransaction, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export type IncomeSourceWithSchedules = Prisma.IncomeSourceGetPayload<{
  include: {
    schedules: true;
    category: { select: { id: true; name: true } };
  };
}>;

export type IncomeTransactionWithSource = Prisma.IncomeTransactionGetPayload<{
  include: { incomeSource: { select: { id: true; name: true } } };
}>;

@Injectable()
export class IncomeRepository {
  constructor(private readonly prisma: PrismaService) {}

  listSources(
    userId: string,
    onlyActive: boolean,
    sourceId?: string,
  ): Promise<IncomeSourceWithSchedules[]> {
    return this.prisma.incomeSource.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(onlyActive ? { isActive: true } : {}),
        ...(sourceId ? { id: sourceId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        schedules: true,
        category: { select: { id: true, name: true } },
      },
    });
  }

  findSource(userId: string, id: string): Promise<IncomeSourceWithSchedules | null> {
    return this.prisma.incomeSource.findFirst({
      where: { id, userId, deletedAt: null },
      include: {
        schedules: true,
        category: { select: { id: true, name: true } },
      },
    });
  }

  createSource(
    data: Prisma.IncomeSourceUncheckedCreateInput,
    tx: Prisma.TransactionClient,
  ): Promise<{ id: string }> {
    return tx.incomeSource.create({ data, select: { id: true } });
  }

  updateSource(id: string, data: Prisma.IncomeSourceUpdateInput) {
    return this.prisma.incomeSource.update({ where: { id }, data });
  }

  softDeleteSource(id: string) {
    return this.prisma.incomeSource.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  createSchedule(
    data: Prisma.IncomeScheduleUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<IncomeSchedule> {
    const client = tx ?? this.prisma;
    return client.incomeSchedule.create({ data });
  }

  findSchedule(userId: string, scheduleId: string): Promise<IncomeSchedule | null> {
    return this.prisma.incomeSchedule.findFirst({ where: { id: scheduleId, userId } });
  }

  updateSchedule(id: string, data: Prisma.IncomeScheduleUpdateInput): Promise<IncomeSchedule> {
    return this.prisma.incomeSchedule.update({ where: { id }, data });
  }

  findTransaction(
    scheduleId: string,
    expectedDate: string,
    tx?: Prisma.TransactionClient,
  ): Promise<IncomeTransaction | null> {
    const client = tx ?? this.prisma;
    return client.incomeTransaction.findFirst({
      where: { incomeScheduleId: scheduleId, expectedDate },
    });
  }

  createTransaction(
    data: Prisma.IncomeTransactionUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<IncomeTransaction> {
    const client = tx ?? this.prisma;
    return client.incomeTransaction.create({ data });
  }

  listTransactionsForSchedules(
    scheduleIds: string[],
    fromDate: string,
  ): Promise<Array<{ incomeScheduleId: string | null; expectedDate: string | null }>> {
    if (scheduleIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.prisma.incomeTransaction.findMany({
      where: { incomeScheduleId: { in: scheduleIds }, expectedDate: { gte: fromDate } },
      select: { incomeScheduleId: true, expectedDate: true },
    });
  }

  async listTransactions(
    userId: string,
    filters: { incomeSourceId?: string; status?: string; cursor?: string },
    limit: number,
  ): Promise<{ items: IncomeTransactionWithSource[]; nextCursor: string | null }> {
    const cursor = filters.cursor
      ? await this.prisma.incomeTransaction.findFirst({
          where: { id: filters.cursor, userId },
        })
      : null;

    const items = await this.prisma.incomeTransaction.findMany({
      where: {
        userId,
        ...(filters.incomeSourceId ? { incomeSourceId: filters.incomeSourceId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(cursor ? { createdAt: { lt: cursor.createdAt } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { incomeSource: { select: { id: true, name: true } } },
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    return { items: page, nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null };
  }
}
