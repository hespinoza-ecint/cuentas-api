import {
  buildFrenchSchedule,
  buildMsiSchedule,
  outstandingPrincipalOf,
} from '../../../src/domain/installments/amortization';

describe('amortizacion de mensualidades (RN-19 y RN-20)', () => {
  describe('buildMsiSchedule', () => {
    it('reparte en cuotas iguales y deja el residuo en la ultima', () => {
      const schedule = buildMsiSchedule(100000, 3);

      expect(schedule.rows.map((row) => row.principal)).toEqual([33333, 33333, 33334]);
      expect(schedule.rows.reduce((sum, row) => sum + row.totalAmount, 0)).toBe(100000);
      expect(schedule.totalInterest).toBe(0);
      expect(schedule.totalIva).toBe(0);
      expect(schedule.estimatedMonthlyPayment).toBe(33333);
    });

    it('reparte exacto cuando el monto es divisible', () => {
      const schedule = buildMsiSchedule(120000, 4);
      expect(schedule.rows.map((row) => row.totalAmount)).toEqual([30000, 30000, 30000, 30000]);
      expect(schedule.rows.reduce((sum, row) => sum + row.totalAmount, 0)).toBe(120000);
    });

    it('valida los parametros', () => {
      expect(() => buildMsiSchedule(1000, 1)).toThrow();
      expect(() => buildMsiSchedule(1000, 49)).toThrow();
      expect(() => buildMsiSchedule(0, 3)).toThrow();
    });
  });

  describe('buildFrenchSchedule', () => {
    it('la suma de capital es exactamente el principal y la ultima cuota cierra el saldo', () => {
      const schedule = buildFrenchSchedule({
        principal: 1_000_000,
        months: 12,
        annualRateBps: 2400,
        ivaRateBps: 1600,
      });

      const totalPrincipal = schedule.rows.reduce((sum, row) => sum + row.principal, 0);
      const totalInterest = schedule.rows.reduce((sum, row) => sum + row.interest, 0);
      const totalIva = schedule.rows.reduce((sum, row) => sum + row.iva, 0);
      const totalRows = schedule.rows.reduce((sum, row) => sum + row.totalAmount, 0);

      expect(totalPrincipal).toBe(1_000_000);
      expect(totalInterest).toBe(schedule.totalInterest);
      expect(totalIva).toBe(schedule.totalIva);
      expect(totalRows).toBe(1_000_000 + schedule.totalInterest + schedule.totalIva);
      expect(schedule.totalInterest).toBeGreaterThan(0);
      expect(schedule.rows[0].interest).toBeGreaterThan(schedule.rows[11].interest);
    });

    it('con tasa cero se comporta como cuotas iguales', () => {
      const schedule = buildFrenchSchedule({
        principal: 100000,
        months: 3,
        annualRateBps: 0,
        ivaRateBps: 1600,
      });

      expect(schedule.rows.reduce((sum, row) => sum + row.principal, 0)).toBe(100000);
      expect(schedule.totalInterest).toBe(0);
      expect(schedule.rows.map((row) => row.principal)).toEqual([33333, 33333, 33334]);
    });

    it('aplica la comision al inicio cuando es UPFRONT', () => {
      const schedule = buildFrenchSchedule({
        principal: 300000,
        months: 6,
        annualRateBps: 3600,
        ivaRateBps: 1600,
        commissionAmount: 5000,
        commissionMode: 'UPFRONT',
      });

      expect(schedule.rows[0].fee).toBe(5000);
      expect(schedule.rows.slice(1).every((row) => row.fee === 0)).toBe(true);
      expect(schedule.totalFee).toBe(5000);
      expect(schedule.rows.reduce((sum, row) => sum + row.totalAmount, 0)).toBe(
        300000 + schedule.totalInterest + schedule.totalIva + 5000,
      );
    });

    it('prorratea la comision con residuo en la ultima', () => {
      const schedule = buildFrenchSchedule({
        principal: 300000,
        months: 4,
        annualRateBps: 1200,
        ivaRateBps: 1600,
        commissionAmount: 1000,
        commissionMode: 'PRORATED',
      });

      expect(schedule.rows.reduce((sum, row) => sum + row.fee, 0)).toBe(1000);
      expect(schedule.rows.map((row) => row.fee)).toEqual([250, 250, 250, 250]);
    });

    it('calcula el IVA sobre los intereses', () => {
      const schedule = buildFrenchSchedule({
        principal: 500000,
        months: 12,
        annualRateBps: 2400,
        ivaRateBps: 1600,
      });

      for (const row of schedule.rows) {
        expect(row.iva).toBe(Math.round(row.interest * 0.16));
      }
    });

    it('replica el ejemplo del banco: cuota fija capital+interes e IVA encima', () => {
      // $21,658.00 a 24 meses con 23% anual fijo (tasa mensual 1.9167%).
      const schedule = buildFrenchSchedule({
        principal: 2_165_800,
        months: 24,
        annualRateBps: 2300,
        ivaRateBps: 1600,
      });

      expect(schedule.rows[0]).toMatchObject({
        principal: 71919,
        interest: 41511,
        iva: 6642,
        totalAmount: 120072,
      });
      expect(schedule.rows[1]).toMatchObject({
        principal: 73297,
        interest: 40133,
        iva: 6421,
        totalAmount: 119851,
      });
      expect(schedule.rows[23]).toMatchObject({
        principal: 111300,
        interest: 2133,
        iva: 341,
        totalAmount: 113774,
      });

      // La cuota fija (capital + interes) es constante: $1,134.30.
      for (let month = 0; month < 23; month += 1) {
        const row = schedule.rows[month];
        expect(row.principal + row.interest).toBe(113430);
      }

      expect(schedule.totalInterest).toBe(556523);
      expect(schedule.totalIva).toBe(89043);
      expect(schedule.rows.reduce((sum, row) => sum + row.principal, 0)).toBe(2_165_800);
      expect(schedule.rows.reduce((sum, row) => sum + row.totalAmount, 0)).toBe(2_811_366);
      expect(schedule.estimatedMonthlyPayment).toBe(117140);
    });
  });

  describe('outstandingPrincipalOf', () => {
    it('suma el capital pendiente y excluye canceladas', () => {
      const outstanding = outstandingPrincipalOf([
        { principal: 10000, paidAmount: 10000, status: 'PAID' },
        { principal: 10000, paidAmount: 4000, status: 'PARTIALLY_PAID' },
        { principal: 10000, paidAmount: 0, status: 'BILLED' },
        { principal: 10000, paidAmount: 0, status: 'CANCELLED' },
      ]);

      expect(outstanding).toBe(16000);
    });
  });
});
