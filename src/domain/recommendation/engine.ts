import { cutDateForPurchase, cutDatesFrom, dueDateFor } from '../cards/card-cycle';
import { buildFrenchSchedule, buildMsiSchedule } from '../installments/amortization';
import { compareLocalDates, daysBetween } from '../shared/local-date';
import {
  CardSnapshot,
  DISCLAIMER,
  EngineContext,
  EngineSuggestion,
  OptionLevel,
  PaymentPlanEntry,
  RecommendationOption,
  RecommendationRequest,
  RecommendationResult,
  ResolvedRule,
} from './types';

const DEFAULT_MSI_MONTHS = 3;
const DEFAULT_FINANCING_TARGET_DAYS = 45;

interface ScoredRule {
  score: number;
  message: string;
  warning?: string;
  params?: Record<string, unknown>;
}

interface ProjectionSummary {
  minimum: number;
  minimumDate: string;
  final: number;
}

/**
 * Motor de recomendaciones: funcion pura que evalua tarjetas y la opcion de
 * pagar con efectivo. No accede a base de datos ni reloj: el servicio le
 * entrega el contexto ya armado (RN de la Fase 6).
 */
export function recommend(
  context: EngineContext,
  request: RecommendationRequest,
): RecommendationResult {
  const options: RecommendationOption[] = [
    ...context.cards.map((card) => buildCardOption(card, request, context)),
    buildCashOption(request, context),
  ];

  for (const option of options) {
    applyEliminatoryRules(option, request, context);
    if (option.eliminatedBy.length === 0) {
      applyScoringRules(option, request, context);
    } else {
      option.score = 0;
      option.level = 'NOT_RECOMMENDED';
    }
  }

  const ordered = options.slice().sort((a, b) => b.score - a.score);
  const eligible = ordered.filter((option) => option.eliminatedBy.length === 0);
  const recommended = eligible[0];
  const outcome = recommended ? (recommended.kind === 'CARD' ? 'CARD' : 'CASH') : 'NONE';

  return {
    outcome,
    recommended,
    alternatives: ordered.filter((option) => option !== recommended),
    suggestions: outcome === 'NONE' ? buildSuggestions(options) : [],
    comparison: {
      financingDays: recommended?.financingDays ?? null,
      interestCost: recommended?.interestCost ?? null,
      utilizationBpsAfter: recommended?.utilizationBpsAfter ?? null,
    },
    disclaimer: DISCLAIMER,
    engineVersion: context.engineVersion,
    evaluatedAt: new Date().toISOString(),
  };
}

function buildCardOption(
  card: CardSnapshot,
  request: RecommendationRequest,
  context: EngineContext,
): RecommendationOption {
  const paymentPlan: PaymentPlanEntry[] = [];
  let cutDate: string | undefined;
  let dueDate: string | undefined;
  let financingDays: number;
  let interestCost = 0;

  if (request.type === 'REGULAR') {
    cutDate = cutDateForPurchase(card.cutDay, request.purchaseDate, card.sameDayCutIncluded);
    dueDate = dueDateFor(cutDate, card.dueDateConfig, context.settings.holidays);
    paymentPlan.push({ date: dueDate, amount: request.amount });
    financingDays = Math.max(daysBetween(request.purchaseDate, dueDate), 0);
  } else {
    const months = request.months ?? DEFAULT_MSI_MONTHS;
    const schedule =
      request.type === 'MSI'
        ? buildMsiSchedule(request.amount, months)
        : buildFrenchSchedule({
            principal: request.amount,
            months,
            annualRateBps: request.annualRateBps ?? 0,
            ivaRateBps: 1600,
          });

    cutDate = cutDateForPurchase(card.cutDay, request.purchaseDate, card.sameDayCutIncluded);
    const cuts = cutDatesFrom(card.cutDay, cutDate, months);
    const dueDates = cuts.map((cut) => dueDateFor(cut, card.dueDateConfig, context.settings.holidays));

    schedule.rows.forEach((row, index) => {
      paymentPlan.push({ date: dueDates[index], amount: row.totalAmount });
    });

    dueDate = dueDates[0];
    financingDays = Math.max(daysBetween(request.purchaseDate, dueDates[months - 1]), 0);
    interestCost = schedule.totalInterest + schedule.totalIva;
  }

  const projection = projectOption(context, paymentPlan);

  return {
    kind: 'CARD',
    cardId: card.id,
    cardAlias: card.alias,
    eligible: true,
    eliminatedBy: [],
    score: 0,
    level: 'NOT_RECOMMENDED',
    reasons: [],
    warnings: [],
    cutDate,
    dueDate,
    financingDays,
    interestCost,
    minimumProjectedBalance: projection.minimum,
    minimumProjectedDate: projection.minimumDate,
    utilizationBpsAfter: Math.round(
      ((card.currentBalance + request.amount) / card.creditLimit) * 10_000,
    ),
    paymentPlan,
  };
}

function buildCashOption(
  request: RecommendationRequest,
  context: EngineContext,
): RecommendationOption {
  const paymentPlan: PaymentPlanEntry[] = [
    { date: request.purchaseDate, amount: request.amount },
  ];
  const projection = projectOption(context, paymentPlan);

  return {
    kind: 'CASH',
    eligible: true,
    eliminatedBy: [],
    score: 0,
    level: 'NOT_RECOMMENDED',
    reasons: [],
    warnings: [],
    dueDate: request.purchaseDate,
    financingDays: 0,
    interestCost: 0,
    minimumProjectedBalance: projection.minimum,
    minimumProjectedDate: projection.minimumDate,
    paymentPlan,
  };
}

/** Proyeccion de flujo: saldo gastable + ingresos - gastos - obligaciones - compra. */
function projectOption(
  context: EngineContext,
  paymentPlan: PaymentPlanEntry[],
): ProjectionSummary {
  const startBalance = context.cashAccounts
    .filter((account) => account.isSpendable)
    .reduce((total, account) => total + account.currentBalance, 0);

  const events = [
    ...context.expectedIncomes.map((income) => ({ date: income.date, amount: income.amount })),
    ...context.scheduledExpenses.map((expense) => ({
      date: expense.date,
      amount: -expense.amount,
    })),
    ...context.cardObligations.map((obligation) => ({
      date: obligation.date,
      amount: -obligation.amount,
    })),
    ...paymentPlan.map((entry) => ({ date: entry.date, amount: -entry.amount })),
  ].sort((a, b) => compareLocalDates(a.date, b.date));

  let balance = startBalance;
  let minimum = startBalance;
  let minimumDate = context.settings.today;

  for (const event of events) {
    balance += event.amount;
    if (balance < minimum) {
      minimum = balance;
      minimumDate = event.date;
    }
  }

  return { minimum, minimumDate, final: balance };
}

/** Fecha a partir de la cual el flujo (sin la compra) cubriria el monto completo. */
function baselineSuggestion(
  context: EngineContext,
  request: RecommendationRequest,
): string | undefined {
  const startBalance = context.cashAccounts
    .filter((account) => account.isSpendable)
    .reduce((total, account) => total + account.currentBalance, 0);

  if (startBalance >= request.amount) {
    return context.settings.today;
  }

  const events = [
    ...context.expectedIncomes.map((income) => ({ date: income.date, amount: income.amount })),
    ...context.scheduledExpenses.map((expense) => ({
      date: expense.date,
      amount: -expense.amount,
    })),
    ...context.cardObligations.map((obligation) => ({
      date: obligation.date,
      amount: -obligation.amount,
    })),
  ].sort((a, b) => compareLocalDates(a.date, b.date));

  let balance = startBalance;
  for (const event of events) {
    balance += event.amount;
    if (balance >= request.amount) {
      return event.date;
    }
  }

  return undefined;
}

function applyEliminatoryRules(
  option: RecommendationOption,
  request: RecommendationRequest,
  context: EngineContext,
): void {
  const rules = enabledRules(context, 'ELIMINATORY');
  const has = (code: string): boolean => rules.some((rule) => rule.code === code);

  if (option.kind === 'CARD') {
    const card = context.cards.find((entry) => entry.id === option.cardId);
    if (!card) {
      option.eliminatedBy.push({ code: 'CARD_ACTIVE', message: 'La tarjeta ya no esta disponible.' });
      return;
    }

    if (has('CARD_ACTIVE') && card.status !== 'ACTIVE') {
      option.eliminatedBy.push({
        code: 'CARD_ACTIVE',
        message: `${card.alias} esta inactiva.`,
      });
    }

    if (has('CREDIT_AVAILABLE') && request.amount > card.availableCredit) {
      option.eliminatedBy.push({
        code: 'CREDIT_AVAILABLE',
        message: `${card.alias} no tiene credito suficiente (disponible ${formatMoney(card.availableCredit)}).`,
        params: { availableCredit: card.availableCredit, amount: request.amount },
      });
    }

    if (
      has('MSI_ELIGIBLE') &&
      request.type === 'MSI' &&
      request.eligibleCardIds &&
      request.eligibleCardIds.length > 0 &&
      !request.eligibleCardIds.includes(card.id)
    ) {
      option.eliminatedBy.push({
        code: 'MSI_ELIGIBLE',
        message: `${card.alias} no es elegible para esta promocion de meses sin intereses.`,
      });
    }
  }

  if (has('CASHFLOW_NON_NEGATIVE') && option.minimumProjectedBalance < 0) {
    const suggestedDate = baselineSuggestion(context, request);
    option.eliminatedBy.push({
      code: 'CASHFLOW_NON_NEGATIVE',
      message: `Con esta opcion el flujo quedaria en ${formatMoney(option.minimumProjectedBalance)} el ${option.minimumProjectedDate}.`,
      params: {
        minimumProjectedBalance: option.minimumProjectedBalance,
        minimumProjectedDate: option.minimumProjectedDate,
        ...(suggestedDate ? { suggestedDate } : {}),
      },
    });
  }
}

function applyScoringRules(
  option: RecommendationOption,
  request: RecommendationRequest,
  context: EngineContext,
): void {
  const rules = enabledRules(context, 'SCORING');
  let weighted = 0;
  let totalWeight = 0;

  for (const rule of rules) {
    const scored = scoreRule(rule, option, request, context);
    if (!scored) {
      continue;
    }

    weighted += rule.weight * scored.score;
    totalWeight += rule.weight;
    option.reasons.push({ code: rule.code, message: scored.message, params: scored.params });

    if (scored.warning) {
      option.warnings.push({ code: rule.code, message: scored.warning });
    }
  }

  option.score = totalWeight > 0 ? Math.round((weighted / totalWeight) * 100) : 0;
  option.level = levelFor(option.score);
}

function scoreRule(
  rule: ResolvedRule,
  option: RecommendationOption,
  request: RecommendationRequest,
  context: EngineContext,
): ScoredRule | null {
  switch (rule.code) {
    case 'NO_INTEREST': {
      if (option.interestCost <= 0) {
        return { score: 1, message: 'Sin intereses: pagarias el total sin costo adicional.' };
      }
      const score = clamp(1 - option.interestCost / (request.amount * 0.05), 0, 1);
      return {
        score,
        message: `Intereses e IVA estimados: ${formatMoney(option.interestCost)}.`,
        params: { interestCost: option.interestCost },
        warning: 'Esta opcion genera intereses.',
      };
    }

    case 'CASH_BUFFER': {
      const required = context.settings.minCashBuffer;
      if (required <= 0) {
        return {
          score: 1,
          message: `Flujo minimo proyectado: ${formatMoney(option.minimumProjectedBalance)}.`,
        };
      }

      const score = clamp(option.minimumProjectedBalance / required, 0, 1);
      return {
        score,
        message: `Flujo minimo proyectado: ${formatMoney(option.minimumProjectedBalance)} el ${option.minimumProjectedDate}.`,
        warning:
          option.minimumProjectedBalance < required
            ? `El flujo minimo queda por debajo del colchon minimo (${formatMoney(required)}).`
            : undefined,
      };
    }

    case 'FINANCING_DAYS': {
      const target = Number(rule.params.targetDays ?? DEFAULT_FINANCING_TARGET_DAYS);
      return {
        score: clamp(option.financingDays / target, 0, 1),
        message:
          option.financingDays > 0
            ? `${option.financingDays} dias de financiamiento hasta el pago.`
            : 'Sin dias de financiamiento (pago inmediato).',
      };
    }

    case 'UTILIZATION': {
      if (option.kind === 'CASH' || option.utilizationBpsAfter === undefined) {
        return { score: 1, message: 'No ocupa credito de tarjetas.' };
      }

      const max = Number(rule.params.maxUtilizationBps ?? context.settings.maxUtilizationBps);
      const utilization = option.utilizationBpsAfter;
      if (utilization <= max) {
        return {
          score: 1,
          message: `Utilizacion de credito: ${(utilization / 100).toFixed(1)}%.`,
        };
      }

      return {
        score: clamp(max / utilization, 0, 1),
        message: `Utilizacion de credito: ${(utilization / 100).toFixed(1)}%.`,
        warning: `Superas la utilizacion maxima recomendada (${(max / 100).toFixed(0)}%).`,
      };
    }

    default:
      return null;
  }
}

function buildSuggestions(options: RecommendationOption[]): EngineSuggestion[] {
  const suggestions: EngineSuggestion[] = [];

  const withSuggestion = options
    .flatMap((option) => option.eliminatedBy)
    .find(
      (finding) =>
        finding.code === 'CASHFLOW_NON_NEGATIVE' &&
        typeof finding.params?.suggestedDate === 'string',
    );
  if (withSuggestion) {
    const date = withSuggestion.params?.suggestedDate as string;
    suggestions.push({
      code: 'RETRY_AFTER_DATE',
      message: `A partir del ${date} tu flujo seria suficiente para esta compra.`,
      params: { date },
    });
  }

  const credit = options
    .filter((option) => option.eliminatedBy.some((finding) => finding.code === 'CREDIT_AVAILABLE'))
    .map((option) => option.cardAlias)
    .filter((alias): alias is string => Boolean(alias));
  if (credit.length > 0) {
    suggestions.push({
      code: 'FREE_CREDIT',
      message: `Necesitas liberar credito en: ${credit.join(', ')}.`,
      params: { cards: credit },
    });
  }

  const msi = options
    .filter((option) => option.eliminatedBy.some((finding) => finding.code === 'MSI_ELIGIBLE'))
    .map((option) => option.cardAlias)
    .filter((alias): alias is string => Boolean(alias));
  if (msi.length > 0) {
    suggestions.push({
      code: 'MSI_NOT_ELIGIBLE',
      message: `Tarjetas no elegibles para esta promocion: ${msi.join(', ')}.`,
      params: { cards: msi },
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      code: 'NO_OPTION',
      message:
        'Ninguna opcion pasa las reglas actuales. Revisa tu flujo de efectivo o ajusta las reglas de recomendacion.',
    });
  }

  return suggestions;
}

function enabledRules(context: EngineContext, kind: 'ELIMINATORY' | 'SCORING'): ResolvedRule[] {
  return context.rules.filter((rule) => rule.isEnabled && rule.kind === kind);
}

function levelFor(score: number): OptionLevel {
  if (score >= 80) {
    return 'EXCELLENT';
  }
  if (score >= 60) {
    return 'GOOD';
  }
  if (score >= 40) {
    return 'FAIR';
  }
  return 'NOT_RECOMMENDED';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  return `${sign}$${(absolute / 100).toFixed(2)}`;
}
