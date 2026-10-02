import {
  addDays,
  addMonths,
  compareLocalDates,
  daysBetween,
  daysInMonth,
  dayOfWeek,
  isValidLocalDate,
  lastDayOfMonth,
  parseLocalDate,
  todayInTimeZone,
} from '../../../src/domain/shared/local-date';

describe('local-date', () => {
  it('valida fechas reales y rechaza dias inexistentes', () => {
    expect(isValidLocalDate('2026-02-28')).toBe(true);
    expect(isValidLocalDate('2026-02-30')).toBe(false);
    expect(isValidLocalDate('2026-13-01')).toBe(false);
    expect(isValidLocalDate('26-01-01')).toBe(false);
    expect(parseLocalDate('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it('suma dias cruzando meses y anos', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('suma meses ajustando al ultimo dia del mes', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('compara fechas y calcula diferencias', () => {
    expect(compareLocalDates('2026-01-01', '2026-01-02')).toBe(-1);
    expect(compareLocalDates('2026-01-02', '2026-01-02')).toBe(0);
    expect(compareLocalDates('2026-02-01', '2026-01-31')).toBe(1);
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
  });

  it('calcula el dia de la semana y el ultimo dia del mes', () => {
    // 2026-01-01 es jueves (4).
    expect(dayOfWeek('2026-01-01')).toBe(4);
    expect(dayOfWeek('2026-01-03')).toBe(6);
    expect(lastDayOfMonth(2026, 2)).toBe('2026-02-28');
  });

  it('calcula hoy en una zona horaria', () => {
    const now = new Date('2026-06-15T03:00:00Z');
    expect(todayInTimeZone('America/Mexico_City', now)).toBe('2026-06-14');
    expect(todayInTimeZone('UTC', now)).toBe('2026-06-15');
  });
});
