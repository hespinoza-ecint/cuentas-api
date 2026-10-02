import { NonBusinessDayRule, adjustToBusinessDay } from '../calendar/business-calendar';
import {
  addDays,
  buildLocalDate,
  compareLocalDates,
  daysBetween,
  daysInMonth,
  dayOfWeek,
  firstDayOfMonth,
  parseLocalDate,
} from '../shared/local-date';
import { ScheduleConfig } from './schedule-config';

export interface GenerateOccurrencesParams {
  config: ScheduleConfig;
  startDate: string;
  endDate?: string | null;
  rule: NonBusinessDayRule;
  holidays: ReadonlySet<string>;
  /** Limite inferior inclusivo para las fechas ya ajustadas. */
  from: string;
  limit: number;
}

const MAX_ITERATIONS = 5000;

/**
 * Genera las proximas fechas de pago de un calendario, ya ajustadas por la
 * regla de dias inhabiles (RN-08 y RN-09). No accede a base de datos ni reloj.
 *
 * Las fechas se calculan en vivo a partir del calendario: si el usuario lo
 * modifica, no quedan fechas viejas guardadas.
 */
export function generateOccurrences(params: GenerateOccurrencesParams): string[] {
  const { config, startDate, endDate, rule, holidays, from, limit } = params;
  const results: string[] = [];

  const push = (rawDate: string): void => {
    if (compareLocalDates(rawDate, startDate) < 0) {
      return;
    }
    if (endDate && compareLocalDates(rawDate, endDate) > 0) {
      return;
    }

    const adjusted = adjustToBusinessDay(rawDate, rule, holidays);
    if (compareLocalDates(adjusted, from) < 0) {
      return;
    }
    if (results.length >= limit || results.includes(adjusted)) {
      return;
    }

    results.push(adjusted);
  };

  const sorted = (): string[] => results.slice().sort(compareLocalDates);

  // ONE_TIME
  if ('date' in config) {
    push(config.date);
    return sorted();
  }

  // WEEKLY
  if ('dayOfWeek' in config) {
    let cursor = startDate;
    let alignment = 0;
    while (dayOfWeek(cursor) !== config.dayOfWeek && alignment < 7) {
      cursor = addDays(cursor, 1);
      alignment += 1;
    }

    let iterations = 0;
    while (results.length < limit && iterations < MAX_ITERATIONS) {
      if (endDate && compareLocalDates(cursor, endDate) > 0) {
        break;
      }
      push(cursor);
      cursor = addDays(cursor, 7);
      iterations += 1;
    }
    return sorted();
  }

  // BIWEEKLY, MONTHLY y CUSTOM (daysOfMonth): dias dentro de cada mes.
  const monthlyDays: Array<number | 'LAST'> | null =
    'days' in config
      ? config.days
      : 'day' in config
        ? [config.day]
        : 'daysOfMonth' in config && config.daysOfMonth
          ? config.daysOfMonth
          : null;

  if (monthlyDays) {
    const windowStart = addDays(from, -45);
    let anchor = startDate;
    if (compareLocalDates(anchor, windowStart) < 0) {
      anchor = firstDayOfMonth(windowStart);
    }

    const anchorParts = parseLocalDate(anchor);
    const startParts = parseLocalDate(startDate);
    if (!anchorParts || !startParts) {
      return sorted();
    }

    let year = anchorParts.year;
    let month = anchorParts.month;
    const endParts = endDate ? parseLocalDate(endDate) : null;
    let iterations = 0;

    while (results.length < limit && iterations < MAX_ITERATIONS) {
      iterations += 1;

      if (endParts && (year > endParts.year || (year === endParts.year && month > endParts.month))) {
        break;
      }
      if (!endParts && year > startParts.year + 50) {
        break;
      }

      for (const day of monthlyDays) {
        const dayNumber = day === 'LAST' ? daysInMonth(year, month) : Math.min(day, daysInMonth(year, month));
        push(buildLocalDate(year, month, dayNumber));
      }

      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    return sorted();
  }

  // CUSTOM con fechas especificas.
  if ('specificDates' in config && config.specificDates) {
    for (const date of config.specificDates.slice().sort(compareLocalDates)) {
      push(date);
    }
    return sorted();
  }

  // CUSTOM cada N dias.
  if ('everyNDays' in config && config.everyNDays) {
    const anchor = config.anchor ?? startDate;
    const step = config.everyNDays;
    const target = addDays(from, -step);
    let steps = 0;
    if (compareLocalDates(anchor, target) < 0) {
      steps = Math.ceil(daysBetween(anchor, target) / step);
    }

    let cursor = addDays(anchor, steps * step);
    let iterations = 0;
    while (results.length < limit && iterations < MAX_ITERATIONS) {
      if (endDate && compareLocalDates(cursor, endDate) > 0) {
        break;
      }
      push(cursor);
      cursor = addDays(cursor, step);
      iterations += 1;
    }
    return sorted();
  }

  return sorted();
}
