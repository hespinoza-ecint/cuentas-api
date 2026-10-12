import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { ClockService } from '../../src/infrastructure/clock/clock.module';
import { authHeader, createCard, createVerifiedUser, TestUser } from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

/**
 * Horizonte del flujo: los recurrentes pagados con tarjeta y la anualidad
 * tienen su impacto en efectivo en el pago del corte que los cobra (no el dia
 * del cargo) y se proyectan dentro de la ventana solicitada.
 */
describe('Horizonte: recurrentes con tarjeta y anualidad (integracion)', () => {
  let app: NestFastifyApplication;
  let clock: ClockService;
  let realNow: () => Date;

  beforeAll(async () => {
    app = await createTestApp();
    clock = app.get(ClockService);
    realNow = clock.now.bind(clock);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  afterEach(() => {
    clock.now = realNow;
  });

  /** Simula la fecha actual (18:00Z = 12:00 en America/Mexico_City). */
  function travelTo(date: string): void {
    clock.now = () => new Date(`${date}T18:00:00Z`);
  }

  interface EventRow {
    date: string;
    type: string;
    amount: number;
    cardId?: string;
  }

  async function projectionEvents(user: TestUser, from: string, to: string): Promise<EventRow[]> {
    const projection = await request(app.getHttpServer())
      .get(`/api/v1/cashflow/projection?from=${from}&to=${to}`)
      .set(...authHeader(user.accessToken))
      .expect(200);

    return projection.body.points.flatMap(
      (point: { date: string; events: Array<{ type: string; amount: number; cardId?: string }> }) =>
        point.events.map((event) => ({ date: point.date, ...event })),
    ) as EventRow[];
  }

  it('RN-25 con tarjeta: el recurrente se paga en el corte, no el dia del cargo', async () => {
    travelTo('2026-10-12');
    const user = await createVerifiedUser(app, 'horizon-card-recurring');
    const card = await createCard(app, user.accessToken, { cutDay: 15, dueDaysAfterCut: 20 });

    await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Streaming',
        amount: 30000,
        paymentMethod: 'CREDIT_CARD',
        creditCardId: card.id,
        schedule: {
          frequency: 'CUSTOM',
          config: { specificDates: ['2026-10-14'] },
          nonBusinessDayRule: 'NONE',
          startDate: '2026-10-01',
        },
      })
      .expect(201);

    const events = await projectionEvents(user, '2026-10-12', '2026-12-31');
    const recurring = events.filter((event) => event.type === 'RECURRING_EXPENSE');

    // El cargo del 14 de octubre cae en el corte del 15: el efectivo sale el
    // 4 de noviembre (corte + 20 dias).
    expect(recurring).toHaveLength(1);
    expect(recurring[0].date).toBe('2026-11-04');
    expect(recurring[0].amount).toBe(-30000);
  });

  it('la anualidad se paga en el corte que la cobra y se proyecta cada ano de la ventana', async () => {
    travelTo('2026-10-12');
    const user = await createVerifiedUser(app, 'horizon-annual-fee');
    await createCard(app, user.accessToken, {
      cutDay: 15,
      dueDaysAfterCut: 20,
      annualFee: 500000,
      annualFeeMonth: 11,
    });

    const events = await projectionEvents(user, '2026-10-12', '2031-10-11');
    const fees = events.filter((event) => event.type === 'ANNUAL_FEE');

    // Noviembre de 2026 a 2030 (la de 2031 cae fuera de la ventana).
    expect(fees).toHaveLength(5);
    for (const fee of fees) {
      expect(fee.amount).toBe(-500000);
      // Cobrada al inicio del mes de la anualidad: se paga tras el corte.
      expect(fee.date > '2026-11-01').toBe(true);
    }
  });
});
