import { z } from 'zod';
import { dayOfWeek, parseLocalDate } from '../shared/local-date';

export const FREQUENCIES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM', 'ONE_TIME'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const NON_BUSINESS_RULES = ['PREVIOUS', 'NEXT', 'NONE'] as const;
export type NonBusinessDayRuleValue = (typeof NON_BUSINESS_RULES)[number];

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD');

export const weeklyConfigSchema = z
  .object({ dayOfWeek: z.number().int().min(0).max(6) })
  .strict();

export const biweeklyConfigSchema = z
  .object({
    days: z
      .array(z.union([z.number().int().min(1).max(31), z.literal('LAST')]))
      .min(1)
      .max(4),
  })
  .strict();

export const monthlyConfigSchema = z
  .object({ day: z.union([z.number().int().min(1).max(31), z.literal('LAST')]) })
  .strict();

export const customConfigSchema = z
  .object({
    everyNDays: z.number().int().min(1).max(365).optional(),
    anchor: localDate.optional(),
    daysOfMonth: z.array(z.number().int().min(1).max(31)).min(1).max(10).optional(),
    specificDates: z.array(localDate).min(1).max(100).optional(),
  })
  .strict()
  .refine(
    (value) =>
      [value.everyNDays, value.daysOfMonth, value.specificDates].filter(
        (entry) => entry !== undefined,
      ).length === 1,
    { message: 'La configuracion personalizada debe indicar exactamente una modalidad' },
  );

export const oneTimeConfigSchema = z.object({ date: localDate }).strict();

export type ScheduleConfig =
  | { dayOfWeek: number }
  | { days: Array<number | 'LAST'> }
  | { day: number | 'LAST' }
  | { everyNDays?: number; anchor?: string; daysOfMonth?: number[]; specificDates?: string[] }
  | { date: string };

export class InvalidScheduleConfigError extends Error {}

/**
 * Valida la configuracion con Zod y aplica valores por defecto sensatos:
 * - WEEKLY: el dia de la semana de `startDate`.
 * - BIWEEKLY: [15, ultimo del mes] (regla RN-08).
 * - MONTHLY: el dia del mes de `startDate`.
 * - ONE_TIME: la fecha de `startDate`.
 */
export function parseScheduleConfig(
  frequency: Frequency,
  rawConfig: unknown,
  startDate: string,
): ScheduleConfig {
  const config = rawConfig ?? {};

  try {
    switch (frequency) {
      case 'WEEKLY': {
        const parsed = weeklyConfigSchema.safeParse(config);
        if (parsed.success) {
          return parsed.data;
        }
        if (Object.keys(config).length === 0) {
          return { dayOfWeek: dayOfWeek(startDate) };
        }
        throw new InvalidScheduleConfigError(parsed.error.issues[0]?.message ?? 'Config invalida');
      }
      case 'BIWEEKLY': {
        const parsed = biweeklyConfigSchema.safeParse(config);
        if (parsed.success) {
          return parsed.data;
        }
        if (Object.keys(config).length === 0) {
          return { days: [15, 'LAST'] };
        }
        throw new InvalidScheduleConfigError(parsed.error.issues[0]?.message ?? 'Config invalida');
      }
      case 'MONTHLY': {
        const parsed = monthlyConfigSchema.safeParse(config);
        if (parsed.success) {
          return parsed.data;
        }
        if (Object.keys(config).length === 0) {
          const parts = parseLocalDate(startDate);
          if (!parts) {
            throw new InvalidScheduleConfigError('startDate invalida');
          }
          return { day: parts.day };
        }
        throw new InvalidScheduleConfigError(parsed.error.issues[0]?.message ?? 'Config invalida');
      }
      case 'CUSTOM': {
        const parsed = customConfigSchema.safeParse(config);
        if (!parsed.success) {
          throw new InvalidScheduleConfigError(
            parsed.error.issues[0]?.message ?? 'Config personalizada invalida',
          );
        }
        return parsed.data;
      }
      case 'ONE_TIME': {
        const parsed = oneTimeConfigSchema.safeParse(config);
        if (parsed.success) {
          return parsed.data;
        }
        if (Object.keys(config).length === 0) {
          return { date: startDate };
        }
        throw new InvalidScheduleConfigError(parsed.error.issues[0]?.message ?? 'Config invalida');
      }
      default:
        throw new InvalidScheduleConfigError(`Frecuencia no soportada: ${String(frequency)}`);
    }
  } catch (error) {
    if (error instanceof InvalidScheduleConfigError) {
      throw error;
    }
    throw new InvalidScheduleConfigError(
      error instanceof Error ? error.message : 'Configuracion invalida',
    );
  }
}
