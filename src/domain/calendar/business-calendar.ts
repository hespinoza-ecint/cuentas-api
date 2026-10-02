import { addDays, dayOfWeek } from '../shared/local-date';

export type NonBusinessDayRule = 'PREVIOUS' | 'NEXT' | 'NONE';

export function isWeekend(value: string): boolean {
  const weekday = dayOfWeek(value);
  return weekday === 0 || weekday === 6;
}

/** Regla RN-09: un dia habil no es fin de semana ni festivo del calendario. */
export function isBusinessDay(value: string, holidays: ReadonlySet<string>): boolean {
  return !isWeekend(value) && !holidays.has(value);
}

/**
 * Ajusta una fecha segun la regla configurada:
 * - PREVIOUS: al dia habil anterior (default de ingresos).
 * - NEXT: al dia habil siguiente.
 * - NONE: sin ajuste.
 */
export function adjustToBusinessDay(
  value: string,
  rule: NonBusinessDayRule,
  holidays: ReadonlySet<string>,
): string {
  if (rule === 'NONE') {
    return value;
  }

  let cursor = value;
  let guard = 0;

  while (!isBusinessDay(cursor, holidays) && guard < 15) {
    cursor = addDays(cursor, rule === 'PREVIOUS' ? -1 : 1);
    guard += 1;
  }

  return cursor;
}
