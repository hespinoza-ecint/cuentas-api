import { Injectable } from '@nestjs/common';
import { RecurringExpense } from '@prisma/client';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnprocessableEntityError,
} from '../../common/errors/http-errors';
import { RequestMeta } from '../../common/http/request-meta';
import { NonBusinessDayRule } from '../../domain/calendar/business-calendar';
import {
  Frequency,
  parseScheduleConfig,
  ScheduleConfig,
} from '../../domain/schedules/schedule-config';
import { generateOccurrences } from '../../domain/schedules/schedule-generator';
import { addDays, compareLocalDates } from '../../domain/shared/local-date';
import { ClockService } from '../../infrastructure/clock/clock.module';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CategoriesService } from '../categories/categories.service';
import { HolidayCalendarService } from '../holidays/holiday-calendar.service';
import { LedgerService } from '../ledger/ledger.service';
import { PurchasesService } from '../purchases/purchases.service';
import {
  ConfirmRecurringExpenseDto,
  CreateRecurringExpenseDto,
  UpdateRecurringExpenseDto,
  UpcomingQueryDto,
} from './dto/recurring-expense.dto';
import {
  ExpensesRepository,
  RecurringExpenseWithCategory,
} from './repositories/expenses.repository';

export interface RecurringOccurrence {
  recurringExpenseId: string;
  name: string;
  expectedDate: string;
  amount: number;
  categoryId: string | null;
  daysUntil: number;
}

/** Resultado de confirmar una ocurrencia (efectivo o tarjeta). */
export interface RecurringConfirmation {
  expenseId?: string;
  movementId?: string;
  purchaseId?: string;
}

type PaymentMethod = 'CASH_ACCOUNT' | 'CREDIT_CARD';

@Injectable()
export class RecurringExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ExpensesRepository,
    private readonly ledger: LedgerService,
    private readonly categories: CategoriesService,
    private readonly holidays: HolidayCalendarService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
    private readonly purchasesService: PurchasesService,
  ) {}

  async list(userId: string, includeInactive = false): Promise<RecurringExpenseWithCategory[]> {
    return this.repository.listRecurring(userId, includeInactive);
  }

  async get(userId: string, id: string): Promise<RecurringExpenseWithCategory> {
    const recurrence = await this.repository.findRecurring(userId, id);
    if (!recurrence) {
      throw new NotFoundError('El gasto recurrente no existe.', {
        reason: 'RECURRING_EXPENSE_NOT_FOUND',
      });
    }
    return recurrence;
  }

  async create(
    userId: string,
    dto: CreateRecurringExpenseDto,
    meta: RequestMeta,
  ): Promise<RecurringExpense> {
    if (dto.categoryId) {
      await this.categories.assertUsable(userId, dto.categoryId, 'EXPENSE');
    }
    const payment = await this.resolvePaymentTarget(userId, {
      paymentMethod: dto.paymentMethod,
      cashAccountId: dto.cashAccountId,
      creditCardId: dto.creditCardId,
    });

    const config = this.parseConfig(dto.schedule.frequency, dto.schedule.config, dto.schedule.startDate);
    this.assertDateRange(dto.schedule.startDate, dto.schedule.endDate);

    const recurrence = await this.repository.createRecurring({
      userId,
      name: dto.name,
      amount: dto.amount,
      amountType: dto.amountType ?? 'FIXED',
      categoryId: dto.categoryId,
      cashAccountId: payment.cashAccountId ?? null,
      creditCardId: payment.creditCardId ?? null,
      paymentMethod: payment.paymentMethod,
      frequency: dto.schedule.frequency,
      config: JSON.stringify(config),
      nonBusinessDayRule: dto.schedule.nonBusinessDayRule ?? 'NONE',
      useHolidays: dto.schedule.useHolidays ?? true,
      startDate: dto.schedule.startDate,
      endDate: dto.schedule.endDate,
    });

    await this.audit.record({
      action: 'recurring_expense.created',
      entityType: 'RecurringExpense',
      entityId: recurrence.id,
      userId,
      actorUserId: userId,
      changes: { name: dto.name, amount: dto.amount, frequency: dto.schedule.frequency },
      ...meta,
    });

    return recurrence;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateRecurringExpenseDto,
    meta: RequestMeta,
  ): Promise<RecurringExpense> {
    const current = await this.get(userId, id);

    if (dto.categoryId) {
      await this.categories.assertUsable(userId, dto.categoryId, 'EXPENSE');
    }
    const payment = await this.resolvePaymentTarget(userId, {
      paymentMethod: dto.paymentMethod,
      cashAccountId: dto.cashAccountId ?? current.cashAccountId,
      creditCardId: dto.creditCardId ?? current.creditCardId,
      currentMethod: current.paymentMethod,
    });

    const startDate = dto.startDate ?? current.startDate;
    const endDate = dto.endDate ?? current.endDate;
    this.assertDateRange(startDate, endDate);

    const config = dto.config
      ? this.parseConfig(current.frequency, dto.config, startDate)
      : undefined;

    const updated = await this.repository.updateRecurring(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
      ...(dto.amountType !== undefined ? { amountType: dto.amountType } : {}),
      ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      paymentMethod: payment.paymentMethod,
      ...(dto.cashAccountId !== undefined ? { cashAccountId: dto.cashAccountId } : {}),
      ...(dto.creditCardId !== undefined ? { creditCardId: dto.creditCardId } : {}),
      ...(config ? { config: JSON.stringify(config) } : {}),
      ...(dto.nonBusinessDayRule !== undefined
        ? { nonBusinessDayRule: dto.nonBusinessDayRule }
        : {}),
      ...(dto.useHolidays !== undefined ? { useHolidays: dto.useHolidays } : {}),
      ...(dto.startDate !== undefined ? { startDate: dto.startDate } : {}),
      ...(dto.endDate !== undefined ? { endDate: dto.endDate } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });

    await this.audit.record({
      action: 'recurring_expense.updated',
      entityType: 'RecurringExpense',
      entityId: id,
      userId,
      actorUserId: userId,
      changes: { before: { name: current.name, amount: current.amount }, after: dto },
      ...meta,
    });

    return updated;
  }

  async remove(userId: string, id: string, meta: RequestMeta): Promise<void> {
    await this.get(userId, id);
    await this.repository.updateRecurring(id, { deletedAt: new Date(), isActive: false });
    await this.audit.record({
      action: 'recurring_expense.deleted',
      entityType: 'RecurringExpense',
      entityId: id,
      userId,
      actorUserId: userId,
      ...meta,
    });
  }

  /** Proximas ocurrencias calculadas en vivo (RN-12 y RN-13 se comparten). */
  async upcoming(userId: string, query: UpcomingQueryDto, recurrenceId?: string) {
    const settings = await this.getSettings(userId);
    const today = this.clock.today(settings.timezone);
    const days = query.days ?? settings.projectionMinDays;
    const limit = query.limit ?? 50;
    const horizon = addDays(today, days);
    // Tambien se listan las vencidas recientes (hasta el limite de dias hacia
    // atras): al confirmarlas quedan fechadas en su dia real y caen en el corte
    // que les corresponde, no en uno futuro.
    const from = addDays(today, -settings.backdateLimitDays);

    const recurrences = recurrenceId
      ? [await this.get(userId, recurrenceId)]
      : await this.repository.listRecurring(userId, false);

    const holidays = await this.holidays.getHolidaySet(
      settings.holidayCalendarCode,
      addDays(from, -15),
      horizon,
    );

    const occurrences: RecurringOccurrence[] = [];

    for (const recurrence of recurrences) {
      const config = this.parseStoredConfig(recurrence);
      const dates = generateOccurrences({
        config,
        startDate: recurrence.startDate,
        endDate: recurrence.endDate,
        rule: recurrence.nonBusinessDayRule as NonBusinessDayRule,
        holidays,
        from,
        limit: 180,
      });

      if (dates.length === 0) {
        continue;
      }

      const [confirmedExpenses, confirmedPurchases] = await Promise.all([
        this.repository.findExpensesByOccurrenceDates(recurrence.id, dates),
        this.repository.findPurchasesByOccurrenceDates(recurrence.id, dates),
      ]);
      const confirmedDates = new Set(
        [...confirmedExpenses, ...confirmedPurchases].map((entry) => entry.occurrenceDate),
      );

      for (const expectedDate of dates) {
        if (compareLocalDates(expectedDate, horizon) > 0) {
          break;
        }
        if (confirmedDates.has(expectedDate)) {
          continue;
        }
        occurrences.push({
          recurringExpenseId: recurrence.id,
          name: recurrence.name,
          expectedDate,
          amount: recurrence.amount,
          categoryId: recurrence.categoryId,
          daysUntil: Math.round(
            (new Date(`${expectedDate}T00:00:00Z`).getTime() -
              new Date(`${today}T00:00:00Z`).getTime()) /
              86_400_000,
          ),
        });
      }
    }

    occurrences.sort((a, b) => compareLocalDates(a.expectedDate, b.expectedDate));

    return { today, timezone: settings.timezone, horizonDays: days, occurrences: occurrences.slice(0, limit) };
  }

  /** Confirma una ocurrencia: crea el gasto (efectivo) o la compra (tarjeta). */
  async confirm(
    userId: string,
    id: string,
    dto: ConfirmRecurringExpenseDto,
    meta: RequestMeta,
  ): Promise<RecurringConfirmation> {
    const recurrence = await this.get(userId, id);

    const [confirmedExpense, confirmedPurchase] = await Promise.all([
      this.repository.findExpenseByOccurrence(id, dto.occurrenceDate),
      this.repository.findPurchaseByOccurrence(id, dto.occurrenceDate),
    ]);
    if (confirmedExpense || confirmedPurchase) {
      throw new ConflictError('Esa ocurrencia ya fue confirmada.', {
        reason: 'OCCURRENCE_ALREADY_CONFIRMED',
      });
    }

    const settings = await this.getSettings(userId);
    const today = this.clock.today(settings.timezone);
    const actualDate =
      dto.actualDate ??
      (compareLocalDates(dto.occurrenceDate, today) > 0 ? today : dto.occurrenceDate);
    const amount = dto.actualAmount ?? recurrence.amount;

    if (recurrence.paymentMethod === 'CREDIT_CARD') {
      return this.confirmWithCard(userId, recurrence, dto, actualDate, amount, meta);
    }

    if (!recurrence.cashAccountId) {
      throw new UnprocessableEntityError('El recurrente no tiene una cuenta de efectivo asignada.', {
        reason: 'CASH_ACCOUNT_REQUIRED',
      });
    }
    const cashAccountId = recurrence.cashAccountId;

    const result = await this.prisma.$transaction(async (tx) => {
      const movement = await this.ledger.postMovement(
        {
          userId,
          cashAccountId,
          type: 'EXPENSE',
          amount: -amount,
          occurredOn: actualDate,
          description: recurrence.name,
          sourceType: 'Expense',
          createdById: userId,
        },
        tx,
      );

      const expense = await tx.expense.create({
        data: {
          userId,
          cashAccountId,
          categoryId: recurrence.categoryId,
          recurringExpenseId: recurrence.id,
          cashMovementId: movement.id,
          description: recurrence.name,
          amount,
          expenseDate: actualDate,
          occurrenceDate: dto.occurrenceDate,
          notes: dto.notes,
        },
      });

      await tx.cashMovement.update({
        where: { id: movement.id },
        data: { sourceId: expense.id },
      });

      await this.audit.record(
        {
          action: 'recurring_expense.confirmed',
          entityType: 'Expense',
          entityId: expense.id,
          userId,
          actorUserId: userId,
          changes: {
            recurringExpenseId: recurrence.id,
            occurrenceDate: dto.occurrenceDate,
            actualDate,
            amount,
          },
          ...meta,
        },
        tx,
      );

      return { expenseId: expense.id, movementId: movement.id };
    });

    return result;
  }

  /** Confirma una ocurrencia cargandola a la tarjeta como compra regular. */
  private async confirmWithCard(
    userId: string,
    recurrence: RecurringExpense,
    dto: ConfirmRecurringExpenseDto,
    actualDate: string,
    amount: number,
    meta: RequestMeta,
  ): Promise<RecurringConfirmation> {
    if (!recurrence.creditCardId) {
      throw new UnprocessableEntityError('El recurrente no tiene una tarjeta asignada.', {
        reason: 'CREDIT_CARD_REQUIRED',
      });
    }

    const purchase = await this.purchasesService.create(
      userId,
      {
        creditCardId: recurrence.creditCardId,
        ...(recurrence.categoryId ? { categoryId: recurrence.categoryId } : {}),
        description: recurrence.name,
        amount,
        purchaseDate: actualDate,
        type: 'REGULAR',
        ...(dto.notes ? { notes: dto.notes } : {}),
      },
      meta,
      { recurringExpenseId: recurrence.id, occurrenceDate: dto.occurrenceDate },
    );

    await this.audit.record({
      action: 'recurring_expense.confirmed',
      entityType: 'Purchase',
      entityId: purchase.id,
      userId,
      actorUserId: userId,
      changes: {
        recurringExpenseId: recurrence.id,
        occurrenceDate: dto.occurrenceDate,
        actualDate,
        amount,
        creditCardId: recurrence.creditCardId,
      },
      ...meta,
    });

    return { purchaseId: purchase.id };
  }

  /** Resuelve y valida la cuenta o tarjeta con la que se paga el recurrente. */
  private async resolvePaymentTarget(
    userId: string,
    input: {
      paymentMethod?: string;
      cashAccountId?: string | null;
      creditCardId?: string | null;
      currentMethod?: string;
    },
  ): Promise<{
    paymentMethod: PaymentMethod;
    cashAccountId?: string | null;
    creditCardId?: string | null;
  }> {
    const method =
      input.paymentMethod ??
      input.currentMethod ??
      (input.creditCardId && !input.cashAccountId
        ? 'CREDIT_CARD'
        : input.cashAccountId && !input.creditCardId
          ? 'CASH_ACCOUNT'
          : undefined);

    if (!method) {
      throw new BadRequestError(
        'Indica el metodo de pago junto con la cuenta de efectivo o la tarjeta.',
        { reason: 'PAYMENT_METHOD_REQUIRED' },
      );
    }

    if (method === 'CREDIT_CARD') {
      if (!input.creditCardId) {
        throw new BadRequestError('Indica la tarjeta de credito.', {
          reason: 'CREDIT_CARD_REQUIRED',
        });
      }
      await this.assertCard(userId, input.creditCardId);
    } else {
      if (!input.cashAccountId) {
        throw new BadRequestError('Indica la cuenta de efectivo.', {
          reason: 'CASH_ACCOUNT_REQUIRED',
        });
      }
      await this.assertAccount(userId, input.cashAccountId);
    }

    return {
      paymentMethod: method as PaymentMethod,
      cashAccountId: input.cashAccountId ?? null,
      creditCardId: input.creditCardId ?? null,
    };
  }

  private async assertCard(userId: string, creditCardId: string): Promise<void> {
    const card = await this.prisma.creditCard.findFirst({
      where: { id: creditCardId, userId, deletedAt: null },
    });
    if (!card) {
      throw new NotFoundError('La tarjeta de credito no existe.', { reason: 'CARD_NOT_FOUND' });
    }
    if (card.status !== 'ACTIVE') {
      throw new UnprocessableEntityError('La tarjeta esta inactiva.', { reason: 'CARD_INACTIVE' });
    }
  }

  private parseConfig(
    frequency: string,
    config: Record<string, unknown> | undefined,
    startDate: string,
  ): ScheduleConfig {
    try {
      return parseScheduleConfig(frequency as Frequency, config, startDate);
    } catch (error) {
      throw new BadRequestError(
        error instanceof Error ? error.message : 'Configuracion de calendario invalida',
        { reason: 'INVALID_SCHEDULE_CONFIG' },
      );
    }
  }

  private parseStoredConfig(recurrence: RecurringExpense): ScheduleConfig {
    return this.parseConfig(
      recurrence.frequency,
      JSON.parse(recurrence.config) as Record<string, unknown>,
      recurrence.startDate,
    );
  }

  private assertDateRange(startDate: string, endDate?: string | null): void {
    if (endDate && compareLocalDates(endDate, startDate) < 0) {
      throw new BadRequestError('endDate no puede ser anterior a startDate.', {
        reason: 'INVALID_DATE_RANGE',
      });
    }
  }

  private async assertAccount(userId: string, cashAccountId: string): Promise<void> {
    const account = await this.prisma.cashAccount.findFirst({
      where: { id: cashAccountId, userId, deletedAt: null },
    });
    if (!account) {
      throw new NotFoundError('La cuenta de efectivo no existe.', { reason: 'ACCOUNT_NOT_FOUND' });
    }
    if (account.status !== 'ACTIVE') {
      throw new UnprocessableEntityError('La cuenta de efectivo esta inactiva.', {
        reason: 'ACCOUNT_INACTIVE',
      });
    }
  }

  private async getSettings(userId: string) {
    return this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }
}
