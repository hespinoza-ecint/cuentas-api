import { NonBusinessDayRule, adjustToBusinessDay } from '../calendar/business-calendar';
import {
  addDays,
  addMonths,
  buildLocalDate,
  compareLocalDates,
  daysInMonth,
  parseLocalDate,
} from '../shared/local-date';

export interface DueDateConfig {
  mode: 'FIXED_DAY' | 'DAYS_AFTER_CUT';
  dueDay?: number | null;
  dueDaysAfterCut?: number | null;
  rule: NonBusinessDayRule;
}

export const DEFAULT_DUE_DAYS_AFTER_CUT = 20;

/**
 * RN-12: fecha de corte de un mes. Si el dia no existe (por ejemplo 31 en
 * febrero) se usa el ultimo dia del mes. El corte NUNCA se ajusta por dias
 * inhabiles.
 */
export function cutDateForMonth(cutDay: number, year: number, month: number): string {
  const day = Math.min(cutDay, daysInMonth(year, month));
  return buildLocalDate(year, month, day);
}

/** Ultimo corte anterior o igual a la fecha de referencia. */
export function previousCutDate(cutDay: number, reference: string): string {
  const parts = parseLocalDate(reference);
  if (!parts) {
    throw new Error(`Fecha invalida: ${reference}`);
  }

  const thisMonth = cutDateForMonth(cutDay, parts.year, parts.month);
  if (compareLocalDates(thisMonth, reference) <= 0) {
    return thisMonth;
  }

  const previousMonth = addMonths(buildLocalDate(parts.year, parts.month, 1), -1);
  const previousParts = parseLocalDate(previousMonth);
  if (!previousParts) {
    throw new Error(`Fecha invalida: ${previousMonth}`);
  }

  return cutDateForMonth(cutDay, previousParts.year, previousParts.month);
}

/** Primer corte estrictamente posterior a la fecha de referencia. */
export function nextCutDate(cutDay: number, reference: string): string {
  const parts = parseLocalDate(reference);
  if (!parts) {
    throw new Error(`Fecha invalida: ${reference}`);
  }

  const thisMonth = cutDateForMonth(cutDay, parts.year, parts.month);
  if (compareLocalDates(thisMonth, reference) > 0) {
    return thisMonth;
  }

  const nextMonth = addMonths(buildLocalDate(parts.year, parts.month, 1), 1);
  const nextParts = parseLocalDate(nextMonth);
  if (!nextParts) {
    throw new Error(`Fecha invalida: ${nextMonth}`);
  }

  return cutDateForMonth(cutDay, nextParts.year, nextParts.month);
}

/** Primer dia del periodo que cierra en `cutDate`. */
export function statementPeriodStart(cutDay: number, cutDate: string): string {
  return addDays(previousCutDate(cutDay, addDays(cutDate, -1)), 1);
}

/** Cortes que caen dentro de [from, to]. */
export function enumerateCutDates(cutDay: number, from: string, to: string): string[] {
  const cuts: string[] = [];
  let cursor = nextCutDate(cutDay, addDays(from, -1));
  let guard = 0;

  while (compareLocalDates(cursor, to) <= 0 && guard < 600) {
    cuts.push(cursor);
    const parts = parseLocalDate(cursor);
    if (!parts) {
      break;
    }
    const nextMonth = addMonths(buildLocalDate(parts.year, parts.month, 1), 1);
    const nextParts = parseLocalDate(nextMonth);
    if (!nextParts) {
      break;
    }
    cursor = cutDateForMonth(cutDay, nextParts.year, nextParts.month);
    guard += 1;
  }

  return cuts;
}

/**
 * RN-13: fecha limite de pago. Puede ser un dia fijo posterior al corte o
 * "N dias despues del corte" y se ajusta al dia habil segun la regla.
 */
export function dueDateFor(
  cutDate: string,
  config: DueDateConfig,
  holidays: ReadonlySet<string>,
): string {
  let raw: string;

  if (config.mode === 'FIXED_DAY') {
    const dueDay = config.dueDay ?? 10;
    const parts = parseLocalDate(cutDate);
    if (!parts) {
      throw new Error(`Fecha invalida: ${cutDate}`);
    }

    const sameMonth = cutDateForMonth(dueDay, parts.year, parts.month);
    if (compareLocalDates(sameMonth, cutDate) > 0) {
      raw = sameMonth;
    } else {
      const nextMonth = addMonths(buildLocalDate(parts.year, parts.month, 1), 1);
      const nextParts = parseLocalDate(nextMonth);
      if (!nextParts) {
        throw new Error(`Fecha invalida: ${nextMonth}`);
      }
      raw = cutDateForMonth(dueDay, nextParts.year, nextParts.month);
    }
  } else {
    raw = addDays(cutDate, config.dueDaysAfterCut ?? DEFAULT_DUE_DAYS_AFTER_CUT);
  }

  return adjustToBusinessDay(raw, config.rule, holidays);
}

/**
 * RN-14: una operacion pertenece al corte si cae dentro del periodo.
 * Con `sameDayCutIncluded` el dia del corte entra en ese corte.
 */
export function isInStatementPeriod(
  date: string,
  periodStart: string,
  cutDate: string,
  sameDayCutIncluded: boolean,
): boolean {
  if (compareLocalDates(date, periodStart) < 0) {
    return false;
  }
  return sameDayCutIncluded
    ? compareLocalDates(date, cutDate) <= 0
    : compareLocalDates(date, cutDate) < 0;
}

export type StatementStatus = 'PAID' | 'OVERDUE' | 'PARTIALLY_PAID' | 'CLOSED';

/** Estado de un corte segun lo pagado contra el "pago para no generar intereses". */
export function statementStatusFor(
  amountToAvoidInterest: number,
  paidAmount: number,
  dueDate: string,
  today: string,
): StatementStatus {
  if (amountToAvoidInterest <= 0 || paidAmount >= amountToAvoidInterest) {
    return 'PAID';
  }
  if (compareLocalDates(dueDate, today) < 0) {
    return 'OVERDUE';
  }
  return paidAmount > 0 ? 'PARTIALLY_PAID' : 'CLOSED';
}
