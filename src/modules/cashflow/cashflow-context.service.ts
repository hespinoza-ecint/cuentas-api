import { Injectable } from '@nestjs/common';
import { CashAccount, CreditCard, UserSettings } from '@prisma/client';
import { UnprocessableEntityError } from '../../common/errors/http-errors';
import {
  DueDateConfig,
  cutDateForPurchase,
  dueDateFor,
} from '../../domain/cards/card-cycle';
import {
  addDays,
  buildLocalDate,
  compareLocalDates,
  daysBetween,
} from '../../domain/shared/local-date';
import { ClockService } from '../../infrastructure/clock/clock.module';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StatementsService } from '../cards/statements.service';
import { RecurringExpensesService, RecurringOccurrence } from '../expenses/recurring-expenses.service';
import { HolidayCalendarService } from '../holidays/holiday-calendar.service';
import { IncomeService, UpcomingIncomeOccurrence } from '../income/income.service';

/** Ventana de la proyeccion de flujo. */
export interface CashflowWindow {
  today: string;
  from: string;
  to: string;
}

const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 1825; // 5 años: cubre planes de hasta 48 meses con margen

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
    private readonly holidays: HolidayCalendarService,
  ) {}

  async buildBase(userId: string, horizonDays: number): Promise<CashflowBase> {
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    const today = this.clock.today(settings.timezone);
    const horizonEnd = addDays(today, horizonDays);
    const holidays = await this.holidays.getHolidaySet(
      settings.holidayCalendarCode,
      today,
      addDays(horizonEnd, 60),
    );

    // Las tarjetas inactivas con deuda siguen contando en las obligaciones.
    const [accounts, allCards, incomeUpcoming, expenseUpcoming] = await Promise.all([
      this.prisma.cashAccount.findMany({
        where: { userId, deletedAt: null, status: 'ACTIVE' },
      }),
      this.prisma.creditCard.findMany({
        where: {
          userId,
          deletedAt: null,
          OR: [{ status: 'ACTIVE' }, { currentBalance: { gt: 0 } }],
        },
      }),
      this.incomeService.upcoming(userId, { days: horizonDays, limit: 1000 }),
      this.recurringExpenses.upcoming(userId, { days: horizonDays, limit: 1000 }),
    ]);
    const cards = allCards.filter((card) => card.status === 'ACTIVE');

    const obligations: CashflowObligation[] = [];

    for (const card of allCards) {
      await this.statementsService.sync(userId, card.id);

      // La deuda se proyecta una sola vez: el ultimo corte no pagado ya
      // incluye el saldo anterior sin cubrir.
      const statements = await this.prisma.cardStatement.findMany({
        where: { userId, creditCardId: card.id },
        orderBy: { cutDate: 'asc' },
      });
      const latestUnpaid = statements.filter((statement) => statement.status !== 'PAID').at(-1);
      if (latestUnpaid && compareLocalDates(latestUnpaid.dueDate, horizonEnd) <= 0) {
        const effective =
          latestUnpaid.noInterestPaymentReported ?? latestUnpaid.noInterestPaymentCalc;
        const outstanding = Math.max(effective - latestUnpaid.paidAmount, 0);
        if (outstanding > 0) {
          obligations.push({
            date: latestUnpaid.dueDate,
            amount: outstanding,
            type: 'CARD_STATEMENT',
            description: `Pago ${card.alias} (corte ${latestUnpaid.cutDate})`,
            cardId: card.id,
            cardAlias: card.alias,
            statementId: latestUnpaid.id,
          });
        }
      }

      // Ciclo abierto: lo que caera en el proximo corte, aun sin materializar.
      const projected = await this.statementsService.projectedNextCut(userId, card);
      if (projected.amount > 0 && compareLocalDates(projected.dueDate, horizonEnd) <= 0) {
        obligations.push({
          date: projected.dueDate,
          amount: projected.amount,
          type: 'CARD_STATEMENT',
          description: `Pago ${card.alias} (corte ${projected.cutDate} por cerrar)`,
          cardId: card.id,
          cardAlias: card.alias,
        });
      }

      const scheduledInstallments = await this.prisma.installment.findMany({
        where: {
          userId,
          plan: { creditCardId: card.id },
          status: { in: ['SCHEDULED', 'PARTIALLY_PAID'] },
          statementCutDate: { not: projected.cutDate },
          dueDate: { lte: horizonEnd },
        },
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

      // RN-24: la anualidad se cobra al libro de la tarjeta y se paga en el
      // corte que la incluye; se proyecta una por ano dentro de la ventana.
      if (card.status === 'ACTIVE' && card.annualFee && card.annualFee > 0 && card.annualFeeMonth) {
        const firstYear = Number(today.slice(0, 4));
        for (let year = firstYear; year <= firstYear + 6; year += 1) {
          const feeDate = buildLocalDate(year, card.annualFeeMonth, 1);
          const cutDate = cutDateForPurchase(
            card.cutDay,
            feeDate,
            card.sameDayCutIncluded,
          );
          const dueDate = this.cardDueDate(card, cutDate, holidays);
          if (compareLocalDates(dueDate, today) < 0) {
            continue;
          }
          if (compareLocalDates(dueDate, horizonEnd) > 0) {
            break;
          }
          obligations.push({
            date: dueDate,
            amount: card.annualFee,
            type: 'ANNUAL_FEE',
            description: `Anualidad ${card.alias}`,
            cardId: card.id,
            cardAlias: card.alias,
          });
        }
      }
    }

    const expenses = expenseUpcoming.occurrences
      .map((occurrence) => this.toCashOccurrence(occurrence, allCards, holidays, today))
      .filter((occurrence) => compareLocalDates(occurrence.expectedDate, horizonEnd) <= 0)
      .sort((a, b) => compareLocalDates(a.expectedDate, b.expectedDate));

    return {
      settings,
      today,
      accounts,
      cards,
      incomes: incomeUpcoming.occurrences,
      expenses,
      obligations,
    };
  }

  /**
   * RN-25 con tarjeta: el cargo al plastico no saca efectivo; el efectivo sale
   * al pagar el corte que lo incluye (RN-13).
   */
  private toCashOccurrence(
    occurrence: RecurringOccurrence,
    cards: CreditCard[],
    holidays: ReadonlySet<string>,
    today: string,
  ): RecurringOccurrence {
    if (occurrence.paymentMethod !== 'CREDIT_CARD' || !occurrence.creditCardId) {
      return occurrence;
    }
    const card = cards.find((entry) => entry.id === occurrence.creditCardId);
    if (!card) {
      return occurrence;
    }

    const cutDate = cutDateForPurchase(
      card.cutDay,
      occurrence.expectedDate,
      card.sameDayCutIncluded,
    );
    const dueDate = this.cardDueDate(card, cutDate, holidays);
    return { ...occurrence, expectedDate: dueDate, daysUntil: daysBetween(today, dueDate) };
  }

  /** RN-13: fecha limite del corte con la configuracion de la tarjeta. */
  private cardDueDate(card: CreditCard, cutDate: string, holidays: ReadonlySet<string>): string {
    return dueDateFor(
      cutDate,
      {
        mode: card.dueDateMode as DueDateConfig['mode'],
        dueDay: card.dueDay,
        dueDaysAfterCut: card.dueDaysAfterCut,
        rule: card.dueNonBusinessDayRule as DueDateConfig['rule'],
      },
      holidays,
    );
  }

  /**
   * RN-29: ventana de la proyeccion. `from` default hoy y no se permite en el
   * pasado; `to` default from + 30 dias. `days` se mantiene por compatibilidad
   * (ventana de N dias a partir de hoy). Maximo 5 años.
   */
  async resolveWindow(
    userId: string,
    query: { from?: string; to?: string; days?: number },
  ): Promise<CashflowWindow> {
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    const today = this.clock.today(settings.timezone);
    const from = query.from ?? today;
    const to = query.to ?? addDays(from, query.days ?? DEFAULT_WINDOW_DAYS);

    if (compareLocalDates(from, today) < 0) {
      throw new UnprocessableEntityError('La proyeccion no puede empezar antes de hoy.', {
        reason: 'RANGE_START_IN_PAST',
      });
    }
    if (compareLocalDates(to, from) <= 0) {
      throw new UnprocessableEntityError('La fecha final debe ser posterior a la inicial.', {
        reason: 'RANGE_END_BEFORE_START',
      });
    }
    if (daysBetween(from, to) > MAX_WINDOW_DAYS) {
      throw new UnprocessableEntityError(
        `La ventana no puede exceder ${MAX_WINDOW_DAYS} dias.`,
        { reason: 'RANGE_TOO_WIDE' },
      );
    }

    return { today, from, to };
  }
}
