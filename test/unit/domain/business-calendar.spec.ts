import {
  adjustToBusinessDay,
  isBusinessDay,
  isWeekend,
} from '../../../src/domain/calendar/business-calendar';

describe('business-calendar (RN-09)', () => {
  const holidays = new Set(['2026-01-01', '2026-04-03']);

  it('detecta fines de semana', () => {
    expect(isWeekend('2026-01-10')).toBe(true); // sabado
    expect(isWeekend('2026-01-11')).toBe(true); // domingo
    expect(isWeekend('2026-01-12')).toBe(false); // lunes
  });

  it('un dia habil no es fin de semana ni festivo', () => {
    expect(isBusinessDay('2026-01-12', holidays)).toBe(true);
    expect(isBusinessDay('2026-01-10', holidays)).toBe(false);
    expect(isBusinessDay('2026-01-01', holidays)).toBe(false);
  });

  it('PREVIOUS mueve al dia habil anterior', () => {
    expect(adjustToBusinessDay('2026-01-10', 'PREVIOUS', holidays)).toBe('2026-01-09');
    expect(adjustToBusinessDay('2026-01-01', 'PREVIOUS', holidays)).toBe('2025-12-31');
  });

  it('NEXT mueve al dia habil siguiente', () => {
    expect(adjustToBusinessDay('2026-01-10', 'NEXT', holidays)).toBe('2026-01-12');
    expect(adjustToBusinessDay('2026-01-01', 'NEXT', holidays)).toBe('2026-01-02');
  });

  it('encadena festivo y fin de semana', () => {
    // Sabado 2026-04-04 con Viernes Santo 2026-04-03: regresa al jueves.
    expect(adjustToBusinessDay('2026-04-04', 'PREVIOUS', holidays)).toBe('2026-04-02');
  });

  it('NONE no ajusta', () => {
    expect(adjustToBusinessDay('2026-01-10', 'NONE', holidays)).toBe('2026-01-10');
  });
});
