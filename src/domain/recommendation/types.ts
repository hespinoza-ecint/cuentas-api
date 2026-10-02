import { DueDateConfig } from '../cards/card-cycle';

export type EnginePurchaseType = 'REGULAR' | 'MSI' | 'DEFERRED_INTEREST';
export type RuleKind = 'ELIMINATORY' | 'SCORING';
export type OptionLevel = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'NOT_RECOMMENDED';
export type Outcome = 'CARD' | 'CASH' | 'NONE';

export interface RecommendationRequest {
  amount: number;
  purchaseDate: string;
  type: EnginePurchaseType;
  months?: number;
  annualRateBps?: number;
  /** Tarjetas elegibles para MSI (si no se indica, todas). */
  eligibleCardIds?: string[];
}

export interface CashAccountSnapshot {
  id: string;
  name: string;
  currentBalance: number;
  isSpendable: boolean;
}

export interface CardSnapshot {
  id: string;
  alias: string;
  status: string;
  creditLimit: number;
  currentBalance: number;
  availableCredit: number;
  cutDay: number;
  sameDayCutIncluded: boolean;
  dueDateConfig: DueDateConfig;
}

export interface ExpectedIncome {
  date: string;
  amount: number;
  description: string;
}

export interface ScheduledExpense {
  date: string;
  amount: number;
  description: string;
}

export interface CardObligation {
  date: string;
  amount: number;
  cardId: string;
  description: string;
}

export interface ResolvedRule {
  code: string;
  kind: RuleKind;
  weight: number;
  params: Record<string, unknown>;
  isEnabled: boolean;
}

export interface EngineSettings {
  today: string;
  timezone: string;
  pendingIncomeGraceDays: number;
  minCashBuffer: number;
  maxUtilizationBps: number;
  projectionMinDays: number;
  holidayCalendarCode: string;
  holidays: ReadonlySet<string>;
}

export interface EngineContext {
  settings: EngineSettings;
  cashAccounts: CashAccountSnapshot[];
  cards: CardSnapshot[];
  expectedIncomes: ExpectedIncome[];
  scheduledExpenses: ScheduledExpense[];
  cardObligations: CardObligation[];
  rules: ResolvedRule[];
  engineVersion: string;
}

export interface RuleFinding {
  code: string;
  message: string;
  params?: Record<string, unknown>;
}

export interface PaymentPlanEntry {
  date: string;
  amount: number;
}

export interface RecommendationOption {
  kind: 'CARD' | 'CASH';
  cardId?: string;
  cardAlias?: string;
  eligible: boolean;
  eliminatedBy: RuleFinding[];
  score: number;
  level: OptionLevel;
  reasons: RuleFinding[];
  warnings: RuleFinding[];
  cutDate?: string;
  dueDate?: string;
  /** Dias de financiamiento: fecha de pago (regular) o ultima mensualidad (planes). */
  financingDays: number;
  minimumProjectedBalance: number;
  minimumProjectedDate: string;
  interestCost: number;
  utilizationBpsAfter?: number;
  paymentPlan: PaymentPlanEntry[];
}

export interface EngineSuggestion {
  code: string;
  message: string;
  params?: Record<string, unknown>;
}

export interface RecommendationResult {
  outcome: Outcome;
  recommended?: RecommendationOption;
  alternatives: RecommendationOption[];
  suggestions: EngineSuggestion[];
  comparison: {
    financingDays: number | null;
    interestCost: number | null;
    utilizationBpsAfter: number | null;
  };
  disclaimer: string;
  engineVersion: string;
  evaluatedAt: string;
}

export const DISCLAIMER =
  'Esta recomendacion es una estimacion basada en la informacion que registraste y no constituye asesoria financiera profesional.';
