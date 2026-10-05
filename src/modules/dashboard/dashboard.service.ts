import { Injectable } from '@nestjs/common';
import { DueDateConfig, dueDateFor, nextCutDate } from '../../domain/cards/card-cycle';
import { addDays, buildLocalDate, compareLocalDates } from '../../domain/shared/local-date';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CashflowContextService } from '../cashflow/cashflow-context.service';
import { HolidayCalendarService } from '../holidays/holiday-calendar.service';
import { DashboardSummaryQueryDto } from './dto/dashboard.dto';

const UPCOMING_DAYS = 30;
const UPCOMING_ITEMS = 5;
const TOP_CATEGORIES = 3;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: CashflowContextService,
    private readonly holidays: HolidayCalendarService,
  ) {}

  async summary(userId: string, query: DashboardSummaryQueryDto) {
    const base = await this.context.buildBase(userId, UPCOMING_DAYS);
    const today = base.today;
    const month = query.month ?? today.slice(0, 7);

    const [year, monthNumber] = month.split('-').map(Number);
    const monthStart = `${month}-01`;
    const monthEnd = buildLocalDate(
      year,
      monthNumber,
      new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(),
    );
    const previous = this.previousMonth(year, monthNumber);
    const previousMonth = `${previous.year}-${String(previous.month).padStart(2, '0')}`;
    const previousStart = `${previousMonth}-01`;
    const previousEnd = buildLocalDate(
      previous.year,
      previous.month,
      new Date(Date.UTC(previous.year, previous.month, 0)).getUTCDate(),
    );

    const holidays = await this.holidays.getHolidaySet(
      base.settings.holidayCalendarCode,
      today,
      addDays(today, 120),
    );

    const statements = await this.prisma.cardStatement.findMany({
      where: { userId, status: { not: 'PAID' } },
    });
    const pendingByCard = new Map<string, number>();
    for (const statement of statements) {
      const effective = statement.noInterestPaymentReported ?? statement.noInterestPaymentCalc;
      const outstanding = Math.max(effective - statement.paidAmount, 0);
      pendingByCard.set(
        statement.creditCardId,
        (pendingByCard.get(statement.creditCardId) ?? 0) + outstanding,
      );
    }

    const cardItems = base.cards.map((card) => {
      const nextCut = nextCutDate(card.cutDay, today);
      const dueConfig: DueDateConfig = {
        mode: card.dueDateMode as DueDateConfig['mode'],
        dueDay: card.dueDay,
        dueDaysAfterCut: card.dueDaysAfterCut,
        rule: card.dueNonBusinessDayRule as DueDateConfig['rule'],
      };
      return {
        id: card.id,
        alias: card.alias,
        last4: card.last4,
        creditLimit: card.creditLimit,
        currentBalance: card.currentBalance,
        availableCredit: card.availableCredit,
        utilizationBps:
          card.creditLimit > 0
            ? Math.round((card.currentBalance / card.creditLimit) * 10_000)
            : 0,
        nextCutDate: nextCut,
        nextDueDate: dueDateFor(nextCut, dueConfig, holidays),
        pendingPayment: pendingByCard.get(card.id) ?? 0,
      };
    });

    const spendableBalance = base.accounts
      .filter((account) => account.isSpendable)
      .reduce((total, account) => total + account.currentBalance, 0);
    const totalBalance = base.accounts.reduce(
      (total, account) => total + account.currentBalance,
      0,
    );

    const incomeTotal = base.incomes.reduce(
      (total, income) => total + income.expectedAmount,
      0,
    );
    const incomeItems = base.incomes.slice(0, UPCOMING_ITEMS).map((income) => ({
      incomeSourceId: income.incomeSourceId,
      incomeScheduleId: income.incomeScheduleId,
      name: income.incomeSourceName,
      date: income.expectedDate,
      amount: income.expectedAmount,
      overdue: income.overdue,
    }));

    const paymentItems = [
      ...base.expenses.map((expense) => ({
        type: 'RECURRING_EXPENSE' as const,
        description: expense.name,
        date: expense.expectedDate,
        amount: expense.amount,
        cardAlias: undefined as string | undefined,
      })),
      ...base.obligations.map((obligation) => ({
        type: obligation.type,
        description: obligation.description,
        date: obligation.date,
        amount: obligation.amount,
        cardAlias: obligation.cardAlias,
      })),
    ].sort((a, b) => compareLocalDates(a.date, b.date));
    const paymentsTotal = paymentItems.reduce((total, item) => total + item.amount, 0);

    const [spent, previousSpent, topGroups] = await Promise.all([
      this.prisma.expense.aggregate({
        _sum: { amount: true },
        where: {
          userId,
          status: 'PAID',
          expenseDate: { gte: monthStart, lte: monthEnd },
        },
      }),
      this.prisma.expense.aggregate({
        _sum: { amount: true },
        where: {
          userId,
          status: 'PAID',
          expenseDate: { gte: previousStart, lte: previousEnd },
        },
      }),
      this.prisma.expense.groupBy({
        by: ['categoryId'],
        where: {
          userId,
          status: 'PAID',
          expenseDate: { gte: monthStart, lte: monthEnd },
          categoryId: { not: null },
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: TOP_CATEGORIES,
      }),
    ]);

    const categoryIds = topGroups
      .map((group) => group.categoryId)
      .filter((id): id is string => id !== null);
    const categories = categoryIds.length
      ? await this.prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true },
        })
      : [];
    const categoryName = new Map(categories.map((category) => [category.id, category.name]));

    const lastRecommendation = await this.prisma.recommendationHistory.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { recommendedCard: { select: { id: true, alias: true, last4: true } } },
    });

    return {
      today,
      timezone: base.settings.timezone,
      month,
      cash: {
        spendableBalance,
        totalBalance,
        accountCount: base.accounts.length,
      },
      cards: {
        totalDebt: cardItems.reduce((total, card) => total + card.currentBalance, 0),
        totalAvailableCredit: cardItems.reduce(
          (total, card) => total + card.availableCredit,
          0,
        ),
        items: cardItems,
      },
      upcomingIncome: {
        horizonDays: UPCOMING_DAYS,
        total: incomeTotal,
        items: incomeItems,
      },
      upcomingPayments: {
        horizonDays: UPCOMING_DAYS,
        total: paymentsTotal,
        items: paymentItems.slice(0, UPCOMING_ITEMS),
      },
      expenses: {
        month,
        spent: spent._sum.amount ?? 0,
        previousMonth,
        previousSpent: previousSpent._sum.amount ?? 0,
        topCategories: topGroups.map((group) => ({
          categoryId: group.categoryId,
          name: group.categoryId ? (categoryName.get(group.categoryId) ?? null) : null,
          amount: group._sum.amount ?? 0,
        })),
      },
      lastRecommendation: lastRecommendation
        ? {
            id: lastRecommendation.id,
            outcome: lastRecommendation.outcome,
            score: lastRecommendation.score,
            cardAlias: lastRecommendation.recommendedCard?.alias ?? null,
            last4: lastRecommendation.recommendedCard?.last4 ?? null,
            createdAt: lastRecommendation.createdAt,
          }
        : null,
    };
  }

  private previousMonth(year: number, month: number): { year: number; month: number } {
    return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  }
}
