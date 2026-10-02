import { parseScheduleConfig } from '../../../src/domain/schedules/schedule-config';
import { generateOccurrences } from '../../../src/domain/schedules/schedule-generator';

describe('schedule-generator', () => {
  const noHolidays = new Set<string>();

  it('RN-08: la quincena por defecto es 15 y ultimo del mes', () => {
    const config = parseScheduleConfig('BIWEEKLY', undefined, '2026-01-01');
    expect(config).toEqual({ days: [15, 'LAST'] });

    const dates = generateOccurrences({
      config,
      startDate: '2026-01-01',
      rule: 'PREVIOUS',
      holidays: noHolidays,
      from: '2026-01-01',
      limit: 4,
    });

    // 2026-01-15 jueves; 2026-01-31 sabado -> viernes 30;
    // 2026-02-15 domingo -> viernes 13; 2026-02-28 sabado -> viernes 27.
    expect(dates).toEqual(['2026-01-15', '2026-01-30', '2026-02-13', '2026-02-27']);
  });

  it('RN-09: si cae en festivo se adelanta al dia habil anterior', () => {
    const config = { days: [15] as Array<number | 'LAST'> };
    const dates = generateOccurrences({
      config,
      startDate: '2026-01-01',
      rule: 'PREVIOUS',
      holidays: new Set(['2026-01-15']),
      from: '2026-01-01',
      limit: 1,
    });

    expect(dates).toEqual(['2026-01-14']);
  });

  it('los dias que no existen en el mes se ajustan al ultimo dia', () => {
    const config = { day: 31 };
    const dates = generateOccurrences({
      config,
      startDate: '2026-01-01',
      rule: 'NONE',
      holidays: noHolidays,
      from: '2026-02-01',
      limit: 2,
    });

    expect(dates).toEqual(['2026-02-28', '2026-03-31']);
  });

  it('WEEKLY usa el dia de la semana de la fecha de inicio por defecto', () => {
    const config = parseScheduleConfig('WEEKLY', undefined, '2026-01-05'); // lunes
    expect(config).toEqual({ dayOfWeek: 1 });

    const dates = generateOccurrences({
      config,
      startDate: '2026-01-05',
      rule: 'NONE',
      holidays: noHolidays,
      from: '2026-01-05',
      limit: 3,
    });

    expect(dates).toEqual(['2026-01-05', '2026-01-12', '2026-01-19']);
  });

  it('CUSTOM each N days respeta la fecha ancla', () => {
    const config = { everyNDays: 10, anchor: '2026-01-01' };
    const dates = generateOccurrences({
      config,
      startDate: '2026-01-01',
      rule: 'NONE',
      holidays: noHolidays,
      from: '2026-01-15',
      limit: 3,
    });

    expect(dates).toEqual(['2026-01-21', '2026-01-31', '2026-02-10']);
  });

  it('CUSTOM con fechas especificas ignora las anteriores al rango', () => {
    const config = { specificDates: ['2026-01-05', '2026-02-10', '2026-03-01'] };
    const dates = generateOccurrences({
      config,
      startDate: '2026-01-01',
      rule: 'NONE',
      holidays: noHolidays,
      from: '2026-02-01',
      limit: 5,
    });

    expect(dates).toEqual(['2026-02-10', '2026-03-01']);
  });

  it('elimina fechas duplicadas tras el ajuste', () => {
    // 2026-02-14 sabado y 2026-02-15 domingo ajustan ambos al viernes 13.
    const config = { days: [14, 15] as Array<number | 'LAST'> };
    const dates = generateOccurrences({
      config,
      startDate: '2026-01-01',
      rule: 'PREVIOUS',
      holidays: noHolidays,
      from: '2026-02-01',
      limit: 3,
    });

    expect(dates).toEqual(['2026-02-13', '2026-03-13', '2026-04-14']);
  });

  it('respeta endDate y el limite de resultados', () => {
    const config = { days: [15] as Array<number | 'LAST'> };
    const dates = generateOccurrences({
      config,
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      rule: 'NONE',
      holidays: noHolidays,
      from: '2026-01-01',
      limit: 10,
    });

    expect(dates).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
  });

  it('ONE_TIME genera una sola fecha', () => {
    const config = { date: '2026-12-20' };
    const dates = generateOccurrences({
      config,
      startDate: '2026-12-20',
      rule: 'NONE',
      holidays: noHolidays,
      from: '2026-01-01',
      limit: 5,
    });

    expect(dates).toEqual(['2026-12-20']);
  });

  it('rechaza configuraciones invalidas', () => {
    expect(() => parseScheduleConfig('WEEKLY', { dayOfWeek: 9 }, '2026-01-01')).toThrow();
    expect(() => parseScheduleConfig('CUSTOM', {}, '2026-01-01')).toThrow();
    expect(() =>
      parseScheduleConfig(
        'CUSTOM',
        { everyNDays: 5, specificDates: ['2026-01-01'] },
        '2026-01-01',
      ),
    ).toThrow();
  });
});
