import { Injectable } from '@nestjs/common';
import { Expense, Prisma, RecurringExpense } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export interface ListExpensesFilters {
  cashAccountId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  cursor?: string;
}

export type ExpenseWithCategory = Prisma.ExpenseGetPayload<{
  include: { category: { select: { id: true; name: true } } };
}>;

export type RecurringExpenseWithCategory = Prisma.RecurringExpenseGetPayload<{
  include: {
    category: { select: { id: true; name: true } };
    cashAccount: { select: { id: true; name: true } };
    creditCard: { select: { id: true; alias: true; last4: true } };
  };
}>;

@Injectable()
export class ExpensesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listExpenses(
    userId: string,
    filters: ListExpensesFilters,
    limit: number,
  ): Promise<{ items: ExpenseWithCategory[]; nextCursor: string | null }> {
    const cursor = filters.cursor
      ? await this.prisma.expense.findFirst({ where: { id: filters.cursor, userId } })
      : null;

    const items = await this.prisma.expense.findMany({
      where: {
        userId,
        ...(filters.cashAccountId ? { cashAccountId: filters.cashAccountId } : {}),
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.from || filters.to
          ? {
              expenseDate: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
        ...(cursor ? { createdAt: { lt: cursor.createdAt } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { category: { select: { id: true, name: true } } },
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    return { items: page, nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null };
  }

  findExpense(userId: string, id: string): Promise<Expense | null> {
    return this.prisma.expense.findFirst({ where: { id, userId } });
  }

  findExpenseByOccurrence(
    recurringExpenseId: string,
    occurrenceDate: string,
  ): Promise<Expense | null> {
    return this.prisma.expense.findFirst({
      where: { recurringExpenseId, occurrenceDate },
    });
  }

  findExpensesByOccurrenceDates(
    recurringExpenseId: string,
    dates: string[],
  ): Promise<Array<{ occurrenceDate: string | null }>> {
    return this.prisma.expense.findMany({
      where: { recurringExpenseId, occurrenceDate: { in: dates } },
      select: { occurrenceDate: true },
    });
  }

  findPurchaseByOccurrence(
    recurringExpenseId: string,
    occurrenceDate: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.purchase.findFirst({
      where: { recurringExpenseId, occurrenceDate },
      select: { id: true },
    });
  }

  findPurchasesByOccurrenceDates(
    recurringExpenseId: string,
    dates: string[],
  ): Promise<Array<{ occurrenceDate: string | null }>> {
    return this.prisma.purchase.findMany({
      where: { recurringExpenseId, occurrenceDate: { in: dates } },
      select: { occurrenceDate: true },
    });
  }

  listRecurring(userId: string, includeInactive: boolean): Promise<RecurringExpenseWithCategory[]> {
    return this.prisma.recurringExpense.findMany({
      where: { userId, deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { createdAt: 'asc' },
      include: {
        category: { select: { id: true, name: true } },
        cashAccount: { select: { id: true, name: true } },
        creditCard: { select: { id: true, alias: true, last4: true } },
      },
    });
  }

  findRecurring(userId: string, id: string): Promise<RecurringExpenseWithCategory | null> {
    return this.prisma.recurringExpense.findFirst({
      where: { id, userId, deletedAt: null },
      include: {
        category: { select: { id: true, name: true } },
        cashAccount: { select: { id: true, name: true } },
        creditCard: { select: { id: true, alias: true, last4: true } },
      },
    });
  }

  createRecurring(
    data: Prisma.RecurringExpenseUncheckedCreateInput,
  ): Promise<RecurringExpense> {
    return this.prisma.recurringExpense.create({ data });
  }

  updateRecurring(
    id: string,
    data: Prisma.RecurringExpenseUpdateInput,
  ): Promise<RecurringExpense> {
    return this.prisma.recurringExpense.update({ where: { id }, data });
  }
}
