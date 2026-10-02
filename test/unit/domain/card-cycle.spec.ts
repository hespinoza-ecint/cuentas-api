import {
  cutDateForMonth,
  dueDateFor,
  enumerateCutDates,
  isInStatementPeriod,
  nextCutDate,
  previousCutDate,
  statementPeriodStart,
  statementStatusFor,
} from '../../../src/domain/cards/card-cycle';

describe('card-cycle (RN-12, RN-13, RN-14)', () => {
  const noHolidays = new Set<string>();

  describe('cutDateForMonth (RN-12)', () => {
    it('usa el dia configurado cuando existe', () => {
      expect(cutDateForMonth(15, 2026, 1)).toBe('2026-01-15');
      expect(cutDateForMonth(5, 2026, 3)).toBe('2026-03-05');
    });

    it('se ajusta al ultimo dia en meses cortos', () => {
      expect(cutDateForMonth(31, 2026, 2)).toBe('2026-02-28');
      expect(cutDateForMonth(31, 2028, 2)).toBe('2028-02-29');
      expect(cutDateForMonth(31, 2026, 4)).toBe('2026-04-30');
      expect(cutDateForMonth(30, 2026, 2)).toBe('2026-02-28');
    });
  });

  describe('previousCutDate / nextCutDate', () => {
    it('encuentra el corte anterior y siguiente alrededor de la referencia', () => {
      expect(previousCutDate(15, '2026-02-10')).toBe('2026-01-15');
      expect(previousCutDate(15, '2026-02-15')).toBe('2026-02-15');
      expect(previousCutDate(15, '2026-02-20')).toBe('2026-02-15');

      expect(nextCutDate(15, '2026-02-10')).toBe('2026-02-15');
      expect(nextCutDate(15, '2026-02-15')).toBe('2026-03-15');
      expect(nextCutDate(15, '2026-02-20')).toBe('2026-03-15');
    });

    it('calcula el inicio del periodo', () => {
      expect(statementPeriodStart(15, '2026-02-15')).toBe('2026-01-16');
      expect(statementPeriodStart(31, '2026-03-31')).toBe('2026-03-01');
    });

    it('enumera los cortes del rango', () => {
      expect(enumerateCutDates(15, '2026-01-01', '2026-03-31')).toEqual([
        '2026-01-15',
        '2026-02-15',
        '2026-03-15',
      ]);
    });
  });

  describe('dueDateFor (RN-13)', () => {
    it('N dias despues del corte', () => {
      expect(
        dueDateFor('2026-01-15', { mode: 'DAYS_AFTER_CUT', dueDaysAfterCut: 20, rule: 'PREVIOUS' }, noHolidays),
      ).toBe('2026-02-04');
    });

    it('se adelanta al dia habil cuando cae en fin de semana', () => {
      // 2026-01-18 (domingo) + 20 dias = sabado 2026-02-07 -> viernes 6.
      expect(
        dueDateFor('2026-01-18', { mode: 'DAYS_AFTER_CUT', dueDaysAfterCut: 20, rule: 'PREVIOUS' }, noHolidays),
      ).toBe('2026-02-06');
    });

    it('dia fijo posterior al corte', () => {
      expect(
        dueDateFor('2026-01-20', { mode: 'FIXED_DAY', dueDay: 10, rule: 'PREVIOUS' }, noHolidays),
      ).toBe('2026-02-10');
      // 2026-01-10 es sabado -> viernes 9.
      expect(
        dueDateFor('2026-01-05', { mode: 'FIXED_DAY', dueDay: 10, rule: 'PREVIOUS' }, noHolidays),
      ).toBe('2026-01-09');
    });

    it('respeta festivos ademas de fines de semana', () => {
      expect(
        dueDateFor(
          '2026-04-15',
          { mode: 'DAYS_AFTER_CUT', dueDaysAfterCut: 20, rule: 'PREVIOUS' },
          new Set(['2026-05-05']),
        ),
      ).toBe('2026-05-04');
    });
  });

  describe('isInStatementPeriod (RN-14)', () => {
    it('incluye el dia del corte cuando esta configurado', () => {
      expect(isInStatementPeriod('2026-02-15', '2026-01-16', '2026-02-15', true)).toBe(true);
      expect(isInStatementPeriod('2026-02-15', '2026-01-16', '2026-02-15', false)).toBe(false);
      expect(isInStatementPeriod('2026-01-16', '2026-01-16', '2026-02-15', true)).toBe(true);
      expect(isInStatementPeriod('2026-01-15', '2026-01-16', '2026-02-15', true)).toBe(false);
    });
  });

  describe('statementStatusFor', () => {
    it('marca pagado, vencido, parcial o cerrado', () => {
      expect(statementStatusFor(1000, 1000, '2026-03-10', '2026-03-01')).toBe('PAID');
      expect(statementStatusFor(1000, 0, '2026-02-20', '2026-03-01')).toBe('OVERDUE');
      expect(statementStatusFor(1000, 400, '2026-03-10', '2026-03-01')).toBe('PARTIALLY_PAID');
      expect(statementStatusFor(1000, 0, '2026-03-10', '2026-03-01')).toBe('CLOSED');
      expect(statementStatusFor(0, 0, '2026-03-10', '2026-03-01')).toBe('PAID');
    });
  });
});
