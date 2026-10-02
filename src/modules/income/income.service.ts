import { Injectable } from '@nestjs/common';
import { IncomeSchedule, IncomeTransaction, UserSettings } from '@prisma/client';
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
import { addDays, compareLocalDates, daysBetween } from '../../domain/shared/local-date';
import { ClockService } from '../../infrastructure/clock/clock.module';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CategoriesService } from '../categories/categories.service';
import { HolidayCalendarService } from '../holidays/holiday-calendar.service';
import { LedgerService } from '../ledger/ledger.service';
import {
  ConfirmIncomeDto,
  CreateIncomeSourceDto,
  IncomeScheduleInputDto,
  ListIncomeTransactionsQueryDto,
  SkipIncomeDto,
  UpdateIncomeScheduleDto,
  UpdateIncomeSourceDto,
  UpcomingIncomeQueryDto,
} from './dto/income.dto';
import {
  IncomeRepository,
  IncomeSourceWithSchedules,
  IncomeTransactionWithSource,
} from './repositories/income.repository';

export interface UpcomingIncomeOccurrence {
  incomeSourceId: string;
  incomeSourceName: string;
  incomeScheduleId: string;
  expectedDate: string;
  expectedAmount: number;
  amountType: string;
  overdue: boolean;
  daysUntil: number;
}

export interface PaginatedIncomeTransactions {
  data: IncomeTransactionWithSource[];
  meta: { limit: number; nextCursor: string | null; hasMore: boolean };
}

type ScheduleResponse = Omit<IncomeSchedule, 'config'> & { config: ScheduleConfig };

@Injectable()
export class IncomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: IncomeRepository,
    private readonly ledger: LedgerService,
    private readonly categories: CategoriesService,
    private readonly holidays: HolidayCalendarService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
  ) {}

  async listSources(userId: string, includeInactive = false) {
    const sources = await this.repository.listSources(userId, !includeInactive);
    return sources.map((source) => this.toSourceResponse(source));
  }

  async getSource(userId: string, id: string) {
    const source = await this.repository.findSource(userId, id);
    if (!source) {
      throw new NotFoundError('La fuente de ingreso no existe.', {
        reason: 'INCOME_SOURCE_NOT_FOUND',
      });
    }
    return this.toSourceResponse(source);
  }

  async createSource(userId: string, dto: CreateIncomeSourceDto, meta: RequestMeta) {
    if (dto.categoryId) {
      await this.categories.assertUsable(userId, dto.categoryId, 'INCOME');
    }
    await this.assertAccount(userId, dto.cashAccountId);

    const schedules = dto.schedules.map((schedule) => {
      this.assertDateRange(schedule.startDate, schedule.endDate);
      return { dto: schedule, config: this.parseConfig(schedule.frequency, schedule.config, schedule.startDate) };
    });

    const sourceId = await this.prisma.$transaction(async (tx) => {
      const source = await this.repository.createSource(
        {
          userId,
          name: dto.name,
          cashAccountId: dto.cashAccountId,
          categoryId: dto.categoryId,
          payer: dto.payer,
          amountType: dto.amountType ?? 'FIXED',
          estimatedAmount: dto.estimatedAmount,
        },
        tx,
      );

      for (const schedule of schedules) {
        await this.repository.createSchedule(
          {
            userId,
            incomeSourceId: source.id,
            frequency: schedule.dto.frequency,
            config: JSON.stringify(schedule.config),
            nonBusinessDayRule: schedule.dto.nonBusinessDayRule ?? 'PREVIOUS',
            useHolidays: schedule.dto.useHolidays ?? true,
            amountOverride: schedule.dto.amountOverride,
            startDate: schedule.dto.startDate,
            endDate: schedule.dto.endDate,
          },
          tx,
        );
      }

      await this.audit.record(
        {
          action: 'income_source.created',
          entityType: 'IncomeSource',
          entityId: source.id,
          userId,
          actorUserId: userId,
          changes: {
            name: dto.name,
            estimatedAmount: dto.estimatedAmount,
            schedules: schedules.length,
          },
          ...meta,
        },
        tx,
      );

      return source.id;
    });

    return this.getSource(userId, sourceId);
  }

  async updateSource(
    userId: string,
    id: string,
    dto: UpdateIncomeSourceDto,
    meta: RequestMeta,
  ) {
    const current = await this.getSource(userId, id);

    if (dto.categoryId) {
      await this.categories.assertUsable(userId, dto.categoryId, 'INCOME');
    }
    if (dto.cashAccountId) {
      await this.assertAccount(userId, dto.cashAccountId);
    }

    await this.repository.updateSource(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.payer !== undefined ? { payer: dto.payer } : {}),
      ...(dto.amountType !== undefined ? { amountType: dto.amountType } : {}),
      ...(dto.estimatedAmount !== undefined ? { estimatedAmount: dto.estimatedAmount } : {}),
      ...(dto.cashAccountId !== undefined ? { cashAccountId: dto.cashAccountId } : {}),
      ...(dto.categoryId !== undefined
        ? { category: { connect: { id: dto.categoryId } } }
        : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });

    await this.audit.record({
      action: 'income_source.updated',
      entityType: 'IncomeSource',
      entityId: id,
      userId,
      actorUserId: userId,
      changes: { before: { name: current.name, estimatedAmount: current.estimatedAmount }, after: dto },
      ...meta,
    });

    return this.getSource(userId, id);
  }

  async removeSource(userId: string, id: string, meta: RequestMeta): Promise<void> {
    await this.getSource(userId, id);
    await this.repository.softDeleteSource(id);
    await this.audit.record({
      action: 'income_source.deleted',
      entityType: 'IncomeSource',
      entityId: id,
      userId,
      actorUserId: userId,
      ...meta,
    });
  }

  async addSchedule(
    userId: string,
    sourceId: string,
    dto: IncomeScheduleInputDto,
    meta: RequestMeta,
  ): Promise<ScheduleResponse> {
    await this.getSource(userId, sourceId);
    this.assertDateRange(dto.startDate, dto.endDate);
    const config = this.parseConfig(dto.frequency, dto.config, dto.startDate);

    const schedule = await this.repository.createSchedule({
      userId,
      incomeSourceId: sourceId,
      frequency: dto.frequency,
      config: JSON.stringify(config),
      nonBusinessDayRule: dto.nonBusinessDayRule ?? 'PREVIOUS',
      useHolidays: dto.useHolidays ?? true,
      amountOverride: dto.amountOverride,
      startDate: dto.startDate,
      endDate: dto.endDate,
    });

    await this.audit.record({
      action: 'income_schedule.created',
      entityType: 'IncomeSchedule',
      entityId: schedule.id,
      userId,
      actorUserId: userId,
      changes: { incomeSourceId: sourceId, frequency: dto.frequency },
      ...meta,
    });

    return this.toScheduleResponse(schedule);
  }

  async updateSchedule(
    userId: string,
    sourceId: string,
    scheduleId: string,
    dto: UpdateIncomeScheduleDto,
    meta: RequestMeta,
  ): Promise<ScheduleResponse> {
    await this.getSource(userId, sourceId);

    const schedule = await this.repository.findSchedule(userId, scheduleId);
    if (!schedule || schedule.incomeSourceId !== sourceId) {
      throw new NotFoundError('El calendario no existe.', { reason: 'INCOME_SCHEDULE_NOT_FOUND' });
    }

    const startDate = dto.startDate ?? schedule.startDate;
    const endDate = dto.endDate ?? schedule.endDate;
    this.assertDateRange(startDate, endDate);

    const config =
      dto.config !== undefined
        ? this.parseConfig(schedule.frequency, dto.config, startDate)
        : undefined;

    const updated = await this.repository.updateSchedule(scheduleId, {
      ...(config ? { config: JSON.stringify(config) } : {}),
      ...(dto.nonBusinessDayRule !== undefined
        ? { nonBusinessDayRule: dto.nonBusinessDayRule }
        : {}),
      ...(dto.useHolidays !== undefined ? { useHolidays: dto.useHolidays } : {}),
      ...(dto.amountOverride !== undefined ? { amountOverride: dto.amountOverride } : {}),
      ...(dto.startDate !== undefined ? { startDate: dto.startDate } : {}),
      ...(dto.endDate !== undefined ? { endDate: dto.endDate } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });

    await this.audit.record({
      action: 'income_schedule.updated',
      entityType: 'IncomeSchedule',
      entityId: scheduleId,
      userId,
      actorUserId: userId,
      changes: { before: { startDate: schedule.startDate, config: schedule.config }, after: dto },
      ...meta,
    });

    return this.toScheduleResponse(updated);
  }

  async deactivateSchedule(
    userId: string,
    sourceId: string,
    scheduleId: string,
    meta: RequestMeta,
  ): Promise<void> {
    await this.getSource(userId, sourceId);
    const schedule = await this.repository.findSchedule(userId, scheduleId);
    if (!schedule || schedule.incomeSourceId !== sourceId) {
      throw new NotFoundError('El calendario no existe.', { reason: 'INCOME_SCHEDULE_NOT_FOUND' });
    }

    await this.repository.updateSchedule(scheduleId, { isActive: false });
    await this.audit.record({
      action: 'income_schedule.deactivated',
      entityType: 'IncomeSchedule',
      entityId: scheduleId,
      userId,
      actorUserId: userId,
      ...meta,
    });
  }

  /**
   * Proximas fechas estimadas (RN-08 y RN-09 ya aplicadas). Los ingresos
   * variables se proyectan con el factor conservador (RN-10) y las fechas
   * vencidas dejan de mostrarse despues de los dias de gracia (RN-11).
   */
  async upcoming(userId: string, query: UpcomingIncomeQueryDto) {
    const settings = await this.getSettings(userId);
    const today = this.clock.today(settings.timezone);
    const days = query.days ?? settings.projectionMinDays;
    const limit = query.limit ?? 50;
    const from = addDays(today, -settings.pendingIncomeGraceDays);
    const horizon = addDays(today, days);

    const sources = (await this.repository.listSources(userId, true, query.incomeSourceId)).filter(
      (source) => source.schedules.some((schedule) => schedule.isActive),
    );

    const scheduleIds = sources.flatMap((source) =>
      source.schedules.filter((schedule) => schedule.isActive).map((schedule) => schedule.id),
    );
    const registered = await this.repository.listTransactionsForSchedules(scheduleIds, from);
    const registeredKeys = new Set(
      registered.map((entry) => `${entry.incomeScheduleId}|${entry.expectedDate}`),
    );

    const holidays = await this.holidays.getHolidaySet(
      settings.holidayCalendarCode,
      addDays(from, -15),
      horizon,
    );

    const occurrences: UpcomingIncomeOccurrence[] = [];

    for (const source of sources) {
      for (const schedule of source.schedules) {
        if (!schedule.isActive) {
          continue;
        }

        const config = this.parseStoredConfig(schedule);
        const dates = generateOccurrences({
          config,
          startDate: schedule.startDate,
          endDate: schedule.endDate,
          rule: schedule.nonBusinessDayRule as NonBusinessDayRule,
          holidays,
          from,
          limit: 60,
        });

        for (const expectedDate of dates) {
          if (compareLocalDates(expectedDate, horizon) > 0) {
            break;
          }
          if (registeredKeys.has(`${schedule.id}|${expectedDate}`)) {
            continue;
          }

          occurrences.push({
            incomeSourceId: source.id,
            incomeSourceName: source.name,
            incomeScheduleId: schedule.id,
            expectedDate,
            expectedAmount: this.projectedAmount(source, schedule, settings),
            amountType: source.amountType,
            overdue: compareLocalDates(expectedDate, today) < 0,
            daysUntil: daysBetween(today, expectedDate),
          });
        }
      }
    }

    occurrences.sort((a, b) => compareLocalDates(a.expectedDate, b.expectedDate));

    return {
      today,
      timezone: settings.timezone,
      graceDays: settings.pendingIncomeGraceDays,
      horizonDays: days,
      occurrences: occurrences.slice(0, limit),
    };
  }

  /** Confirma el ingreso real; puede diferir del estimado (RN-10 y RN-11). */
  async confirm(userId: string, dto: ConfirmIncomeDto, meta: RequestMeta): Promise<IncomeTransaction> {
    const source = await this.repository.findSource(userId, dto.incomeSourceId);
    if (!source) {
      throw new NotFoundError('La fuente de ingreso no existe.', {
        reason: 'INCOME_SOURCE_NOT_FOUND',
      });
    }

    const schedule = source.schedules.find((entry) => entry.id === dto.incomeScheduleId);
    if (!schedule) {
      throw new BadRequestError('El calendario no pertenece a la fuente de ingreso.', {
        reason: 'SCHEDULE_MISMATCH',
      });
    }

    const settings = await this.getSettings(userId);
    const today = this.clock.today(settings.timezone);
    const expectedAmount = schedule.amountOverride ?? source.estimatedAmount;
    const actualAmount = dto.actualAmount ?? expectedAmount;
    const actualDate =
      dto.actualDate ??
      (compareLocalDates(dto.expectedDate, today) > 0 ? today : dto.expectedDate);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.repository.findTransaction(schedule.id, dto.expectedDate, tx);
      if (existing) {
        throw new ConflictError('Esa fecha ya fue registrada (confirmada u omitida).', {
          reason: 'OCCURRENCE_ALREADY_REGISTERED',
        });
      }

      const movement = await this.ledger.postMovement(
        {
          userId,
          cashAccountId: source.cashAccountId,
          type: 'INCOME',
          amount: actualAmount,
          occurredOn: actualDate,
          description: `${source.name} (${dto.expectedDate})`,
          sourceType: 'IncomeTransaction',
          createdById: userId,
        },
        tx,
      );

      const transaction = await tx.incomeTransaction.create({
        data: {
          userId,
          incomeSourceId: source.id,
          incomeScheduleId: schedule.id,
          cashMovementId: movement.id,
          expectedDate: dto.expectedDate,
          expectedAmount,
          actualDate,
          actualAmount,
          status: 'CONFIRMED',
          notes: dto.notes,
        },
      });

      await tx.cashMovement.update({
        where: { id: movement.id },
        data: { sourceId: transaction.id },
      });

      await this.audit.record(
        {
          action: 'income.transaction.confirmed',
          entityType: 'IncomeTransaction',
          entityId: transaction.id,
          userId,
          actorUserId: userId,
          changes: {
            incomeSourceId: source.id,
            expectedDate: dto.expectedDate,
            expectedAmount,
            actualAmount,
            actualDate,
          },
          ...meta,
        },
        tx,
      );

      return transaction;
    });
  }

  async skip(userId: string, dto: SkipIncomeDto, meta: RequestMeta): Promise<IncomeTransaction> {
    const source = await this.repository.findSource(userId, dto.incomeSourceId);
    if (!source) {
      throw new NotFoundError('La fuente de ingreso no existe.', {
        reason: 'INCOME_SOURCE_NOT_FOUND',
      });
    }

    const schedule = source.schedules.find((entry) => entry.id === dto.incomeScheduleId);
    if (!schedule) {
      throw new BadRequestError('El calendario no pertenece a la fuente de ingreso.', {
        reason: 'SCHEDULE_MISMATCH',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.repository.findTransaction(schedule.id, dto.expectedDate, tx);
      if (existing) {
        throw new ConflictError('Esa fecha ya fue registrada (confirmada u omitida).', {
          reason: 'OCCURRENCE_ALREADY_REGISTERED',
        });
      }

      const transaction = await this.repository.createTransaction(
        {
          userId,
          incomeSourceId: source.id,
          incomeScheduleId: schedule.id,
          expectedDate: dto.expectedDate,
          expectedAmount: schedule.amountOverride ?? source.estimatedAmount,
          status: 'SKIPPED',
          notes: dto.notes,
        },
        tx,
      );

      await this.audit.record(
        {
          action: 'income.transaction.skipped',
          entityType: 'IncomeTransaction',
          entityId: transaction.id,
          userId,
          actorUserId: userId,
          changes: { incomeSourceId: source.id, expectedDate: dto.expectedDate },
          ...meta,
        },
        tx,
      );

      return transaction;
    });
  }

  async listTransactions(
    userId: string,
    query: ListIncomeTransactionsQueryDto,
  ): Promise<PaginatedIncomeTransactions> {
    const limit = query.limit ?? 20;
    const { items, nextCursor } = await this.repository.listTransactions(userId, query, limit);
    return { data: items, meta: { limit, nextCursor, hasMore: nextCursor !== null } };
  }

  private projectedAmount(
    source: IncomeSourceWithSchedules,
    schedule: IncomeSchedule,
    settings: UserSettings,
  ): number {
    const base = schedule.amountOverride ?? source.estimatedAmount;

    if (source.amountType === 'VARIABLE') {
      // RN-10: los ingresos variables se proyectan con un factor conservador.
      return Math.round((base * settings.variableIncomeFactorBps) / 10_000);
    }

    return base;
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

  private parseStoredConfig(schedule: IncomeSchedule): ScheduleConfig {
    return this.parseConfig(
      schedule.frequency,
      JSON.parse(schedule.config) as Record<string, unknown>,
      schedule.startDate,
    );
  }

  private toSourceResponse(source: IncomeSourceWithSchedules) {
    return {
      ...source,
      schedules: source.schedules.map((schedule) => this.toScheduleResponse(schedule)),
    };
  }

  private toScheduleResponse(schedule: IncomeSchedule): ScheduleResponse {
    const { config: _config, ...rest } = schedule;
    return { ...rest, config: this.parseStoredConfig(schedule) };
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

  private async getSettings(userId: string): Promise<UserSettings> {
    return this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }
}
