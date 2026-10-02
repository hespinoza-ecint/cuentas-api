import { recommend } from '../../../src/domain/recommendation/engine';
import {
  CardSnapshot,
  EngineContext,
  RecommendationRequest,
  ResolvedRule,
} from '../../../src/domain/recommendation/types';

function rule(
  code: string,
  kind: 'ELIMINATORY' | 'SCORING',
  weight: number,
  params: Record<string, unknown> = {},
): ResolvedRule {
  return { code, kind, weight, params, isEnabled: true };
}

const DEFAULT_RULES: ResolvedRule[] = [
  rule('CARD_ACTIVE', 'ELIMINATORY', 0),
  rule('CREDIT_AVAILABLE', 'ELIMINATORY', 0),
  rule('MSI_ELIGIBLE', 'ELIMINATORY', 0),
  rule('CASHFLOW_NON_NEGATIVE', 'ELIMINATORY', 0),
  rule('NO_INTEREST', 'SCORING', 35),
  rule('CASH_BUFFER', 'SCORING', 25),
  rule('FINANCING_DAYS', 'SCORING', 25, { targetDays: 45 }),
  rule('UTILIZATION', 'SCORING', 15),
];

function card(overrides: Partial<CardSnapshot> = {}): CardSnapshot {
  return {
    id: 'card-1',
    alias: 'Oro',
    status: 'ACTIVE',
    creditLimit: 2_000_000,
    currentBalance: 300_000,
    availableCredit: 1_700_000,
    cutDay: 15,
    sameDayCutIncluded: true,
    dueDateConfig: { mode: 'DAYS_AFTER_CUT', dueDaysAfterCut: 20, rule: 'PREVIOUS' },
    ...overrides,
  };
}

function context(overrides: Partial<EngineContext> = {}): EngineContext {
  return {
    settings: {
      today: '2026-05-10',
      timezone: 'America/Mexico_City',
      pendingIncomeGraceDays: 3,
      minCashBuffer: 100_000,
      maxUtilizationBps: 3000,
      projectionMinDays: 60,
      holidayCalendarCode: 'MX_BANKING',
      holidays: new Set<string>(),
    },
    cashAccounts: [{ id: 'acc-1', name: 'Debito', currentBalance: 500_000, isSpendable: true }],
    cards: [card()],
    expectedIncomes: [],
    scheduledExpenses: [],
    cardObligations: [],
    rules: DEFAULT_RULES,
    engineVersion: 'test',
    ...overrides,
  };
}

function regularPurchase(overrides: Partial<RecommendationRequest> = {}): RecommendationRequest {
  return { amount: 200_000, purchaseDate: '2026-05-10', type: 'REGULAR', ...overrides };
}

describe('motor de recomendaciones', () => {
  it('regular: calcula corte, fecha de pago y dias de financiamiento', () => {
    const result = recommend(context(), regularPurchase());
    const option = result.recommended?.cardId ? result.recommended : result.alternatives[0];

    expect(result.outcome).toBe('CARD');
    expect(option.cardId).toBe('card-1');
    expect(option.cutDate).toBe('2026-05-15');
    expect(option.dueDate).toBe('2026-06-04');
    expect(option.financingDays).toBe(25);
    expect(option.interestCost).toBe(0);
    expect(option.paymentPlan).toEqual([{ date: '2026-06-04', amount: 200_000 }]);
    expect(option.level).toBe('EXCELLENT');
    expect(result.disclaimer).toContain('no constituye asesoria financiera');
  });

  it('MSI: elimina tarjetas no elegibles para la promocion', () => {
    const contextWithTwoCards = context({
      cards: [card({ id: 'card-1' }), card({ id: 'card-2', alias: 'Plata' })],
    });

    const request: RecommendationRequest = {
      amount: 300_000,
      purchaseDate: '2026-05-10',
      type: 'MSI',
      months: 6,
      eligibleCardIds: ['card-2'],
    };
    const result = recommend(contextWithTwoCards, request);

    const excluded = result.alternatives.find((option) => option.cardId === 'card-1');
    expect(excluded?.eliminatedBy.some((finding) => finding.code === 'MSI_ELIGIBLE')).toBe(true);
    expect(result.outcome).toBe('CARD');
    expect(result.recommended?.cardId).toBe('card-2');
    expect(result.recommended?.financingDays).toBeGreaterThan(150);
  });

  it('credito insuficiente elimina la tarjeta y gana el efectivo si el flujo alcanza', () => {
    const result = recommend(
      context({ cards: [card({ availableCredit: 50_000 })] }),
      regularPurchase(),
    );

    const eliminated = result.alternatives.find((option) => option.kind === 'CARD');
    expect(eliminated?.eliminatedBy.some((finding) => finding.code === 'CREDIT_AVAILABLE')).toBe(
      true,
    );
    expect(result.outcome).toBe('CASH');
    expect(result.recommended?.kind).toBe('CASH');
  });

  it('flujo negativo elimina opciones y sugiere la fecha en que alcanzaria', () => {
    const result = recommend(
      context({
        cashAccounts: [{ id: 'acc-1', name: 'Debito', currentBalance: 0, isSpendable: true }],
        expectedIncomes: [
          { date: '2026-06-10', amount: 500_000, description: 'Sueldo' },
        ],
      }),
      regularPurchase(),
    );

    expect(result.outcome).toBe('NONE');
    expect(result.recommended).toBeUndefined();
    for (const option of result.alternatives) {
      expect(
        option.eliminatedBy.some((finding) => finding.code === 'CASHFLOW_NON_NEGATIVE'),
      ).toBe(true);
    }
    const suggestion = result.suggestions.find((entry) => entry.code === 'RETRY_AFTER_DATE');
    expect(suggestion?.params?.date).toBe('2026-06-10');
  });

  it('una compra diferida con intereses prefiere el efectivo cuando existe flujo', () => {
    const result = recommend(
      context(),
      regularPurchase({ type: 'DEFERRED_INTEREST', months: 6, annualRateBps: 4800 }),
    );

    expect(result.outcome).toBe('CASH');
    const deferred = result.alternatives.find((option) => option.kind === 'CARD');
    expect(deferred?.interestCost).toBeGreaterThan(0);
    expect(deferred?.warnings.some((warning) => warning.code === 'NO_INTEREST')).toBe(true);
  });

  it('advierte cuando la utilizacion supera el maximo recomendado', () => {
    const result = recommend(
      context({
        cards: [card({ creditLimit: 100_000, currentBalance: 60_000, availableCredit: 40_000 })],
      }),
      regularPurchase({ amount: 25_000 }),
    );

    const option = result.recommended;
    expect(option?.utilizationBpsAfter).toBe(8500);
    expect(option?.warnings.some((warning) => warning.code === 'UTILIZATION')).toBe(true);
  });

  it('una regla eliminatoria deshabilitada permite opciones con flujo negativo', () => {
    const rules = DEFAULT_RULES.filter((entry) => entry.code !== 'CASHFLOW_NON_NEGATIVE');
    const result = recommend(
      context({
        cashAccounts: [{ id: 'acc-1', name: 'Debito', currentBalance: 0, isSpendable: true }],
        rules,
      }),
      regularPurchase(),
    );

    expect(result.outcome).toBe('CARD');
    expect(result.recommended?.eliminatedBy).toHaveLength(0);
    expect(result.recommended?.warnings.some((warning) => warning.code === 'CASH_BUFFER')).toBe(
      true,
    );
  });

  it('los pesos personalizados cambian el puntaje', () => {
    const rules = [
      rule('CASHFLOW_NON_NEGATIVE', 'ELIMINATORY', 0),
      rule('NO_INTEREST', 'SCORING', 0),
      rule('CASH_BUFFER', 'SCORING', 0),
      rule('FINANCING_DAYS', 'SCORING', 100, { targetDays: 45 }),
      rule('UTILIZATION', 'SCORING', 0),
    ];
    const result = recommend(context({ rules }), regularPurchase());

    // 25 dias de 45 objetivo = 55.6% -> 56.
    expect(result.recommended?.score).toBe(56);
    expect(result.recommended?.level).toBe('FAIR');
  });

  it('la lista de alternativas queda ordenada de mejor a peor', () => {
    const contextWithTwoCards = context({
      cards: [card({ id: 'card-1' }), card({ id: 'card-2', alias: 'Plata', currentBalance: 0 })],
    });
    const result = recommend(contextWithTwoCards, regularPurchase());
    const scores = [result.recommended, ...result.alternatives]
      .filter((option): option is NonNullable<typeof option> => Boolean(option))
      .map((option) => option.score);

    for (let index = 1; index < scores.length; index += 1) {
      expect(scores[index - 1]).toBeGreaterThanOrEqual(scores[index]);
    }
  });
});
