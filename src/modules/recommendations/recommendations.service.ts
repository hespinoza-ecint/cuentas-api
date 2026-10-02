import { Injectable } from '@nestjs/common';
import {
  BadRequestError,
  NotFoundError,
} from '../../common/errors/http-errors';
import { RequestMeta } from '../../common/http/request-meta';
import { DueDateConfig } from '../../domain/cards/card-cycle';
import { recommend } from '../../domain/recommendation/engine';
import {
  CardObligation,
  EngineContext,
  RecommendationResult,
  ResolvedRule,
  RuleKind,
} from '../../domain/recommendation/types';
import { addDays } from '../../domain/shared/local-date';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StatementsService } from '../cards/statements.service';
import { RecurringExpensesService } from '../expenses/recurring-expenses.service';
import { HolidayCalendarService } from '../holidays/holiday-calendar.service';
import { IncomeService } from '../income/income.service';
import { FinancialDatePolicy } from '../ledger/financial-date.policy';
import {
  AdminUpdateRuleDto,
  CreateRecommendationDto,
  ListRecommendationsQueryDto,
  UpdateRuleOverrideDto,
} from './dto/recommendation.dto';

export const ENGINE_VERSION = '1.0.0';

const DEFAULT_HORIZON_DAYS = 60;
const MAX_HORIZON_DAYS = 365;

export interface ResolvedRuleView extends ResolvedRule {
  name: string;
  description: string;
  isOverridden: boolean;
}

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly datePolicy: FinancialDatePolicy,
    private readonly incomeService: IncomeService,
    private readonly recurringExpenses: RecurringExpensesService,
    private readonly statementsService: StatementsService,
    private readonly holidays: HolidayCalendarService,
  ) {}

  async recommend(
    userId: string,
    dto: CreateRecommendationDto,
    meta: RequestMeta,
  ): Promise<RecommendationResult & { historyId: string }> {
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    const today = await this.datePolicy.today(userId);
    const horizonDays = this.horizonFor(settings.projectionMinDays, dto);

    const [accounts, cards, incomeUpcoming, expenseUpcoming, rules] = await Promise.all([
      this.prisma.cashAccount.findMany({
        where: { userId, deletedAt: null, status: 'ACTIVE' },
      }),
      this.prisma.creditCard.findMany({ where: { userId, deletedAt: null, status: 'ACTIVE' } }),
      this.incomeService.upcoming(userId, { days: horizonDays, limit: 100 }),
      this.recurringExpenses.upcoming(userId, { days: horizonDays, limit: 100 }),
      this.resolveRules(userId),
    ]);

    const obligations: CardObligation[] = [];

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
            cardId: card.id,
            description: `Pago ${card.alias} (corte ${statement.cutDate})`,
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
            cardId: card.id,
            description: `Mensualidad ${card.alias}`,
          });
        }
      }
    }

    const holidays = await this.holidays.getHolidaySet(
      settings.holidayCalendarCode,
      addDays(today, -15),
      addDays(today, horizonDays + 120),
    );

    const context: EngineContext = {
      settings: {
        today,
        timezone: settings.timezone,
        pendingIncomeGraceDays: settings.pendingIncomeGraceDays,
        minCashBuffer: settings.minCashBuffer,
        maxUtilizationBps: settings.maxUtilizationBps,
        projectionMinDays: settings.projectionMinDays,
        holidayCalendarCode: settings.holidayCalendarCode,
        holidays,
      },
      cashAccounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        currentBalance: account.currentBalance,
        isSpendable: account.isSpendable,
      })),
      cards: cards.map((card) => ({
        id: card.id,
        alias: card.alias,
        status: card.status,
        creditLimit: card.creditLimit,
        currentBalance: card.currentBalance,
        availableCredit: card.availableCredit,
        cutDay: card.cutDay,
        sameDayCutIncluded: card.sameDayCutIncluded,
        dueDateConfig: {
          mode: card.dueDateMode as DueDateConfig['mode'],
          dueDay: card.dueDay,
          dueDaysAfterCut: card.dueDaysAfterCut,
          rule: card.dueNonBusinessDayRule as DueDateConfig['rule'],
        },
      })),
      expectedIncomes: incomeUpcoming.occurrences.map((occurrence) => ({
        date: occurrence.expectedDate,
        amount: occurrence.expectedAmount,
        description: occurrence.incomeSourceName,
      })),
      scheduledExpenses: expenseUpcoming.occurrences.map((occurrence) => ({
        date: occurrence.expectedDate,
        amount: occurrence.amount,
        description: occurrence.name,
      })),
      cardObligations: obligations,
      rules,
      engineVersion: ENGINE_VERSION,
    };

    const result = recommend(context, {
      amount: dto.amount,
      purchaseDate: dto.purchaseDate,
      type: dto.type as 'REGULAR' | 'MSI' | 'DEFERRED_INTEREST',
      months: dto.months,
      annualRateBps: dto.annualRateBps,
      eligibleCardIds: dto.eligibleCardIds,
    });

    // Snapshot sin festivos (se derivan del calendario configurado).
    const contextSnapshot = {
      settings: { ...context.settings, holidays: undefined },
      cashAccounts: context.cashAccounts,
      cards: context.cards,
      expectedIncomes: context.expectedIncomes,
      scheduledExpenses: context.scheduledExpenses,
      cardObligations: context.cardObligations,
    };

    const history = await this.prisma.recommendationHistory.create({
      data: {
        userId,
        recommendedCardId: result.recommended?.cardId ?? null,
        engineVersion: ENGINE_VERSION,
        requestInput: JSON.stringify(dto),
        contextSnapshot: JSON.stringify(contextSnapshot),
        rulesSnapshot: JSON.stringify(rules),
        result: JSON.stringify(result),
        outcome: result.outcome,
        score: result.recommended?.score ?? null,
      },
    });

    await this.audit.record({
      action: 'recommendation.created',
      entityType: 'RecommendationHistory',
      entityId: history.id,
      userId,
      actorUserId: userId,
      changes: {
        outcome: result.outcome,
        score: result.recommended?.score ?? null,
        recommendedCardId: result.recommended?.cardId ?? null,
        amount: dto.amount,
      },
      ...meta,
    });

    return { historyId: history.id, ...result };
  }

  async listHistory(userId: string, query: ListRecommendationsQueryDto) {
    const limit = query.limit ?? 20;
    const cursor = query.cursor
      ? await this.prisma.recommendationHistory.findFirst({
          where: { id: query.cursor, userId },
        })
      : null;

    const items = await this.prisma.recommendationHistory.findMany({
      where: { userId, ...(cursor ? { createdAt: { lt: cursor.createdAt } } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { recommendedCard: { select: { id: true, alias: true, last4: true } } },
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    return {
      data: page.map((entry) => ({
        id: entry.id,
        outcome: entry.outcome,
        score: entry.score,
        engineVersion: entry.engineVersion,
        recommendedCard: entry.recommendedCard,
        requestInput: this.parseJson(entry.requestInput),
        createdAt: entry.createdAt,
      })),
      meta: { limit, nextCursor: hasMore ? page[page.length - 1].id : null, hasMore },
    };
  }

  async getHistory(userId: string, id: string) {
    const entry = await this.prisma.recommendationHistory.findFirst({
      where: { id, userId },
      include: { recommendedCard: { select: { id: true, alias: true, last4: true } } },
    });

    if (!entry) {
      throw new NotFoundError('La recomendacion no existe.', {
        reason: 'RECOMMENDATION_NOT_FOUND',
      });
    }

    return {
      id: entry.id,
      outcome: entry.outcome,
      score: entry.score,
      engineVersion: entry.engineVersion,
      recommendedCard: entry.recommendedCard,
      requestInput: this.parseJson(entry.requestInput),
      contextSnapshot: this.parseJson(entry.contextSnapshot),
      rulesSnapshot: this.parseJson(entry.rulesSnapshot),
      result: this.parseJson(entry.result),
      createdAt: entry.createdAt,
    };
  }

  async listRules(userId: string): Promise<ResolvedRuleView[]> {
    const rules = await this.prisma.recommendationRule.findMany({ orderBy: { code: 'asc' } });
    const overrides = await this.prisma.userRecommendationRuleOverride.findMany({
      where: { userId },
    });
    const overrideByRule = new Map(overrides.map((override) => [override.ruleId, override]));

    return rules.map((rule) => {
      const override = overrideByRule.get(rule.id);
      return {
        code: rule.code,
        kind: rule.kind as RuleKind,
        name: rule.name,
        description: rule.description,
        isEnabled: override?.isEnabled ?? rule.isEnabled,
        weight: override?.weight ?? rule.weight,
        params: {
          ...(this.parseJson(rule.params) ?? {}),
          ...(this.parseJson(override?.params) ?? {}),
        },
        isOverridden: override !== undefined,
      };
    });
  }

  async upsertRuleOverride(
    userId: string,
    code: string,
    dto: UpdateRuleOverrideDto,
    meta: RequestMeta,
  ) {
    const rule = await this.prisma.recommendationRule.findUnique({ where: { code } });
    if (!rule) {
      throw new NotFoundError('La regla no existe.', { reason: 'RULE_NOT_FOUND' });
    }

    const override = await this.prisma.userRecommendationRuleOverride.upsert({
      where: { userId_ruleId: { userId, ruleId: rule.id } },
      update: {
        ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
        ...(dto.weight !== undefined ? { weight: dto.weight } : {}),
        ...(dto.params !== undefined ? { params: JSON.stringify(dto.params) } : {}),
      },
      create: {
        userId,
        ruleId: rule.id,
        isEnabled: dto.isEnabled,
        weight: dto.weight,
        params: dto.params !== undefined ? JSON.stringify(dto.params) : undefined,
      },
    });

    await this.audit.record({
      action: 'recommendation_rule.override_updated',
      entityType: 'UserRecommendationRuleOverride',
      entityId: override.id,
      userId,
      actorUserId: userId,
      changes: { code, ...dto },
      ...meta,
    });

    return this.listRules(userId);
  }

  async removeRuleOverride(userId: string, code: string, meta: RequestMeta): Promise<void> {
    const rule = await this.prisma.recommendationRule.findUnique({ where: { code } });
    if (!rule) {
      throw new NotFoundError('La regla no existe.', { reason: 'RULE_NOT_FOUND' });
    }

    await this.prisma.userRecommendationRuleOverride.deleteMany({
      where: { userId, ruleId: rule.id },
    });

    await this.audit.record({
      action: 'recommendation_rule.override_removed',
      entityType: 'RecommendationRule',
      entityId: rule.id,
      userId,
      actorUserId: userId,
      changes: { code },
      ...meta,
    });
  }

  async adminUpdateRule(code: string, dto: AdminUpdateRuleDto, actorUserId: string, meta: RequestMeta) {
    const rule = await this.prisma.recommendationRule.findUnique({ where: { code } });
    if (!rule) {
      throw new NotFoundError('La regla no existe.', { reason: 'RULE_NOT_FOUND' });
    }

    if (rule.kind === 'ELIMINATORY' && dto.weight !== undefined) {
      throw new BadRequestError('Las reglas eliminatorias no tienen peso.', {
        reason: 'ELIMINATORY_RULE_WITH_WEIGHT',
      });
    }

    const updated = await this.prisma.recommendationRule.update({
      where: { code },
      data: {
        ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
        ...(dto.weight !== undefined ? { weight: dto.weight } : {}),
        ...(dto.params !== undefined ? { params: JSON.stringify(dto.params) } : {}),
        version: { increment: 1 },
      },
    });

    await this.audit.record({
      action: 'recommendation_rule.updated',
      entityType: 'RecommendationRule',
      entityId: rule.id,
      actorUserId,
      changes: { code, ...dto },
      ...meta,
    });

    return updated;
  }

  private async resolveRules(userId: string): Promise<ResolvedRule[]> {
    const rules = await this.prisma.recommendationRule.findMany({ orderBy: { code: 'asc' } });
    const overrides = await this.prisma.userRecommendationRuleOverride.findMany({
      where: { userId },
    });
    const overrideByRule = new Map(overrides.map((override) => [override.ruleId, override]));

    return rules.map((rule) => {
      const override = overrideByRule.get(rule.id);
      return {
        code: rule.code,
        kind: rule.kind as RuleKind,
        weight: override?.weight ?? rule.weight,
        params: {
          ...(this.parseJson(rule.params) ?? {}),
          ...(this.parseJson(override?.params) ?? {}),
        },
        isEnabled: override?.isEnabled ?? rule.isEnabled,
      };
    });
  }

  private horizonFor(projectionMinDays: number, dto: CreateRecommendationDto): number {
    if (dto.type === 'REGULAR') {
      return Math.max(projectionMinDays, DEFAULT_HORIZON_DAYS);
    }

    const months = dto.months ?? 3;
    return Math.min(Math.max(projectionMinDays, months * 31 + 31), MAX_HORIZON_DAYS);
  }

  private parseJson(value: string | null | undefined): Record<string, unknown> | undefined {
    if (!value) {
      return undefined;
    }
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
}
