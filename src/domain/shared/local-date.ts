/**
 * Fechas de calendario ("YYYY-MM-DD") sin horas ni zona horaria.
 * Toda la aritmetica usa UTC para evitar saltos por horario de verano.
 */

export interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseLocalDate(value: string): LocalDateParts | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }

  return { year, month, day };
}

export function isValidLocalDate(value: string): boolean {
  return parseLocalDate(value) !== null;
}

export function toDate(value: string): Date {
  const parts = parseLocalDate(value);
  if (!parts) {
    throw new Error(`Fecha invalida: ${value}`);
  }
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

export function formatLocalDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildLocalDate(year: number, month: number, day: number): string {
  return formatLocalDate(new Date(Date.UTC(year, month - 1, day)));
}

export function addDays(value: string, days: number): string {
  const date = toDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatLocalDate(date);
}

export function addMonths(value: string, months: number): string {
  const parts = parseLocalDate(value);
  if (!parts) {
    throw new Error(`Fecha invalida: ${value}`);
  }

  const targetMonth = parts.month - 1 + months;
  const year = parts.year + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12 + 1;
  const day = Math.min(parts.day, daysInMonth(year, month));
  return buildLocalDate(year, month, day);
}

/** Devuelve -1, 0 o 1 comparando dos fechas de calendario. */
export function compareLocalDates(a: string, b: string): number {
  const timeA = toDate(a).getTime();
  const timeB = toDate(b).getTime();
  if (timeA === timeB) {
    return 0;
  }
  return timeA < timeB ? -1 : 1;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

/** 0 = domingo, 6 = sabado. */
export function dayOfWeek(value: string): number {
  return toDate(value).getUTCDay();
}

export function lastDayOfMonth(year: number, month: number): string {
  return buildLocalDate(year, month, daysInMonth(year, month));
}

export function firstDayOfMonth(value: string): string {
  const parts = parseLocalDate(value);
  if (!parts) {
    throw new Error(`Fecha invalida: ${value}`);
  }
  return buildLocalDate(parts.year, parts.month, 1);
}

/** Fecha de "hoy" en la zona horaria del usuario, como "YYYY-MM-DD". */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
