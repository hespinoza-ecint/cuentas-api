import { Injectable } from '@nestjs/common';
import { compareLocalDates } from '../../domain/shared/local-date';
import { CashflowContextService } from './cashflow-context.service';
import { ProjectionQueryDto } from './dto/cashflow.dto';

const DEFAULT_HORIZON_DAYS = 60;

export type ProjectionEventType =
  | 'INCOME'
  | 'RECURRING_EXPENSE'
  | 'CARD_STATEMENT'
  | 'INSTALLMENT'
  | 'ANNUAL_FEE';

export interface ProjectionEvent {
  type: ProjectionEventType;
  description: string;
  /** Monto con signo: positivo entra al efectivo, negativo sale. */
  amount: number;
  cardId?: string;
  cardAlias?: string;
  incomeSourceId?: string;
  incomeScheduleId?: string;
  recurringExpenseId?: string;
  statementId?: string;
  installmentId?: string;
}

export interface ProjectionPoint {
  date: string;
  inflows: number;
  outflows: number;
  balance: number;
  events: ProjectionEvent[];
}

@Injectable()
export class CashflowService {
  constructor(private readonly context: CashflowContextService) {}

  async projection(userId: string, query: ProjectionQueryDto) {
    const horizonDays = query.days ?? DEFAULT_HORIZON_DAYS;
    const base = await this.context.buildBase(userId, horizonDays);

    const startingBalance = base.accounts
      .filter((account) => account.isSpendable)
      .reduce((total, account) => total + account.currentBalance, 0);

    const dated: { date: string; event: ProjectionEvent }[] = [
      ...base.incomes.map((income) => ({
        date: income.expectedDate,
        event: {
          type: 'INCOME' as const,
          description: income.incomeSourceName,
          amount: income.expectedAmount,
          incomeSourceId: income.incomeSourceId,
          incomeScheduleId: income.incomeScheduleId,
        },
      })),
      ...base.expenses.map((expense) => ({
        date: expense.expectedDate,
        event: {
          type: 'RECURRING_EXPENSE' as const,
          description: expense.name,
          amount: -expense.amount,
          recurringExpenseId: expense.recurringExpenseId,
        },
      })),
      ...base.obligations.map((obligation) => ({
        date: obligation.date,
        event: {
          type: obligation.type,
          description: obligation.description,
          amount: -obligation.amount,
          cardId: obligation.cardId,
          cardAlias: obligation.cardAlias,
          statementId: obligation.statementId,
          installmentId: obligation.installmentId,
        },
      })),
    ].sort((a, b) => compareLocalDates(a.date, b.date));

    let balance = startingBalance;
    let minimum = startingBalance;
    let minimumDate = base.today;
    const points: ProjectionPoint[] = [];
    let current: ProjectionPoint | null = null;

    for (const item of dated) {
      if (!current || current.date !== item.date) {
        current = {
          date: item.date,
          inflows: 0,
          outflows: 0,
          balance: startingBalance,
          events: [],
        };
        points.push(current);
      }

      current.events.push(item.event);
      if (item.event.amount >= 0) {
        current.inflows += item.event.amount;
      } else {
        current.outflows += -item.event.amount;
      }
      balance += item.event.amount;
      current.balance = balance;

      if (balance < minimum) {
        minimum = balance;
        minimumDate = item.date;
      }
    }

    return {
      today: base.today,
      timezone: base.settings.timezone,
      horizonDays,
      startingBalance,
      minCashBuffer: base.settings.minCashBuffer,
      points,
      minimum: { date: minimumDate, balance: minimum },
      finalBalance: balance,
      belowBuffer: minimum < base.settings.minCashBuffer,
    };
  }
}
