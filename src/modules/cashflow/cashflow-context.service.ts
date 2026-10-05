import { Injectable } from '@nestjs/common';
import { CashAccount, CreditCard, UserSettings } from '@prisma/client';
import { buildLocalDate, compareLocalDates } from '../../domain/shared/local-date';
import { ClockService } from '../../infrastructure/clock/clock.module';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StatementsService } from '../cards/statements.service';
import { RecurringExpensesService, RecurringOccurrence } from '../expenses/recurring-expenses.service';
import { IncomeService, UpcomingIncomeOccurrence } from '../income/income.service';

export type CashflowObligationType = 'CARD_STATEMENT' | 'INSTALLMENT' | 'ANNUAL_FEE';

export interface CashflowObligation {
  date: string;
  amount: number;
  type: CashflowObligationType;
  description: string;
  cardId: string;
  cardAlias: string;
  statementId?: string;
  installmentId?: string;
}

/**
 * Piezas compartidas del flujo de efectivo: cuentas, tarjetas, ingresos y
 * gastos programados y obligaciones de tarjeta (cortes, mensualidades y
 * anualidades). Lo usan tanto el motor de recomendaciones como la proyeccion
 * de flujo y el resumen del dashboard, para que todos vean los mismos datos.
 */
export interface CashflowBase {
  settings: UserSettings;
  today: string;
  accounts: CashAccount[];
  cards: CreditCard[];
  incomes: UpcomingIncomeOccurrence[];
  expenses: RecurringOccurrence[];
  obligations: CashflowObligation[];
}

@Injectable()
export class CashflowContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly incomeService: IncomeService,
    private readonly recurringExpenses: RecurringExpensesService,
    private readonly statementsService: StatementsService,
  ) {}

  async buildBase(userId: string, horizonDays: number): Promise<CashflowBase> {
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    const today = this.clock.today(settings.timezone);

    const [accounts, cards, incomeUpcoming, expenseUpcoming] = await Promise.all([
      this.prisma.cashAccount.findMany({
        where: { userId, deletedAt: null, status: 'ACTIVE' },
      }),
      this.prisma.creditCard.findMany({ where: { userId, deletedAt: null, status: 'ACTIVE' } }),
      this.incomeService.upcoming(userId, { days: horizonDays, limit: 100 }),
      this.recurringExpenses.upcoming(userId, { days: horizonDays, limit: 100 }),
    ]);

    const obligations: CashflowObligation[] = [];

    for (const card of cards) {
      await this.statementsService.sync(userId, card.id);

      const statements = await this.prisma.cardStatement.findMany({
        where: { userId, creditCardId: card.id, status: { not: 'PAID' } },
      });
      for (const statement of statements) {
        const effective = statement.noInterestPaymentReported ?? statement.noInterestPaymentCalc;
        const outstanding = effective - statement.paidAmount;
        if (outstanding > 0) {
          obligations.push({
            date: statement.dueDate,
            amount: outstanding,
            type: 'CARD_STATEMENT',
            description: `Pago ${card.alias} (corte ${statement.cutDate})`,
            cardId: card.id,
            cardAlias: card.alias,
            statementId: statement.id,
          });
        }
      }

      const scheduledInstallments = await this.prisma.installment.findMany({
        where: { userId, plan: { creditCardId: card.id }, status: 'SCHEDULED' },
      });
      for (const installment of scheduledInstallments) {
        const outstanding = installment.totalAmount - installment.paidAmount;
        if (outstanding > 0) {
          obligations.push({
            date: installment.dueDate,
            amount: outstanding,
            type: 'INSTALLMENT',
            description: `Mensualidad ${card.alias}`,
            cardId: card.id,
            cardAlias: card.alias,
            installmentId: installment.id,
          });
        }
      }

      // RN-24: la anualidad se proyecta como cargo futuro.
      if (card.annualFee && card.annualFee > 0 && card.annualFeeMonth) {
        obligations.push({
          date: this.nextAnnualFeeDate(today, card.annualFeeMonth),
          amount: card.annualFee,
          type: 'ANNUAL_FEE',
          description: `Anualidad ${card.alias}`,
          cardId: card.id,
          cardAlias: card.alias,
        });
      }
    }

    return {
      settings,
      today,
      accounts,
      cards,
      incomes: incomeUpcoming.occurrences,
      expenses: expenseUpcoming.occurrences,
      obligations,
    };
  }

  /** RN-24: proxima anualidad (dia 1 del mes configurado). */
  nextAnnualFeeDate(today: string, month: number): string {
    const year = Number(today.slice(0, 4));
    const candidate = buildLocalDate(year, month, 1);
    return compareLocalDates(candidate, today) < 0
      ? buildLocalDate(year + 1, month, 1)
      : candidate;
  }
}
