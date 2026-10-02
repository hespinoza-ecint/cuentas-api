export interface SeedHoliday {
  calendarCode: string;
  date: string;
  name: string;
}

function create(
  calendarCode: string,
  entries: Array<[date: string, name: string]>,
): SeedHoliday[] {
  return entries.map(([date, name]) => ({ calendarCode, date, name }));
}

/**
 * Festivos de Mexico para 2026 y 2027.
 *
 * - MX_LABOR: descansos obligatorios de la Ley Federal del Trabajo.
 * - MX_BANKING: dias inhabiles bancarios (CNBV). Incluye Jueves y Viernes Santo,
 *   2 de noviembre y 12 de diciembre.
 *
 * Regla de negocio RN-09: si un ingreso cae en dia inhabil se adelanta al dia
 * habil anterior. Este catalogo alimenta esa regla.
 */
export const holidays: SeedHoliday[] = [
  ...create('MX_LABOR', [
    ['2026-01-01', 'Ano Nuevo'],
    ['2026-02-02', 'Dia de la Constitucion (lunes)'],
    ['2026-03-16', 'Natalicio de Benito Juarez (lunes)'],
    ['2026-05-01', 'Dia del Trabajo'],
    ['2026-09-16', 'Dia de la Independencia'],
    ['2026-11-16', 'Dia de la Revolucion (lunes)'],
    ['2026-12-25', 'Navidad'],
    ['2027-01-01', 'Ano Nuevo'],
    ['2027-02-01', 'Dia de la Constitucion (lunes)'],
    ['2027-03-15', 'Natalicio de Benito Juarez (lunes)'],
    ['2027-05-01', 'Dia del Trabajo'],
    ['2027-09-16', 'Dia de la Independencia'],
    ['2027-11-15', 'Dia de la Revolucion (lunes)'],
    ['2027-12-25', 'Navidad'],
  ]),
  ...create('MX_BANKING', [
    ['2026-01-01', 'Ano Nuevo'],
    ['2026-02-02', 'Dia de la Constitucion (lunes)'],
    ['2026-03-16', 'Natalicio de Benito Juarez (lunes)'],
    ['2026-04-02', 'Jueves Santo'],
    ['2026-04-03', 'Viernes Santo'],
    ['2026-05-01', 'Dia del Trabajo'],
    ['2026-09-16', 'Dia de la Independencia'],
    ['2026-11-02', 'Dia de Muertos'],
    ['2026-11-16', 'Dia de la Revolucion (lunes)'],
    ['2026-12-12', 'Dia de la Virgen de Guadalupe'],
    ['2026-12-25', 'Navidad'],
    ['2027-01-01', 'Ano Nuevo'],
    ['2027-02-01', 'Dia de la Constitucion (lunes)'],
    ['2027-03-15', 'Natalicio de Benito Juarez (lunes)'],
    ['2027-03-25', 'Jueves Santo'],
    ['2027-03-26', 'Viernes Santo'],
    ['2027-05-01', 'Dia del Trabajo'],
    ['2027-09-16', 'Dia de la Independencia'],
    ['2027-11-02', 'Dia de Muertos'],
    ['2027-11-15', 'Dia de la Revolucion (lunes)'],
    ['2027-12-12', 'Dia de la Virgen de Guadalupe'],
    ['2027-12-25', 'Navidad'],
  ]),
];
