import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { addDays, daysBetween, todayInTimeZone } from '../../src/domain/shared/local-date';
import {
  authHeader,
  createCard,
  createCashAccount,
  createVerifiedUser,
} from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Flujo de efectivo (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('proyecta ingresos, gastos y calcula el minimo con los mismos datos que el motor', async () => {
    const user = await createVerifiedUser(app, 'cashflow');
    const today = todayInTimeZone('America/Mexico_City');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 500000 });
    const incomeDate = addDays(today, 3);
    const expenseDate = addDays(today, 1);

    await request(app.getHttpServer())
      .post('/api/v1/income/sources')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Bono',
        cashAccountId: account.id,
        estimatedAmount: 100000,
        schedules: [
          {
            frequency: 'CUSTOM',
            config: { specificDates: [incomeDate] },
            nonBusinessDayRule: 'NONE',
            startDate: today,
          },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Renta',
        amount: 700000,
        cashAccountId: account.id,
        schedule: {
          frequency: 'CUSTOM',
          config: { specificDates: [expenseDate] },
          nonBusinessDayRule: 'NONE',
          startDate: today,
        },
      })
      .expect(201);

    const projection = await request(app.getHttpServer())
      .get('/api/v1/cashflow/projection?days=30')
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(projection.body.today).toBe(today);
    expect(projection.body.startingBalance).toBe(500000);
    expect(projection.body.points).toHaveLength(2);

    const dates = projection.body.points.map((point: { date: string }) => point.date);
    expect(dates).toEqual([expenseDate, incomeDate]);

    const expensePoint = projection.body.points[0];
    expect(expensePoint.outflows).toBe(700000);
    expect(expensePoint.balance).toBe(-200000);
    expect(expensePoint.events[0].type).toBe('RECURRING_EXPENSE');

    const incomePoint = projection.body.points[1];
    expect(incomePoint.inflows).toBe(100000);
    expect(incomePoint.balance).toBe(-100000);
    expect(incomePoint.events[0].type).toBe('INCOME');

    // 500000 - 700000 = -200000 el dia del gasto; + 100000 = -100000 al final.
    expect(projection.body.minimum).toEqual({ date: expenseDate, balance: -200000 });
    expect(projection.body.finalBalance).toBe(-100000);
    expect(projection.body.belowBuffer).toBe(true);
  });

  it('incluye las obligaciones de tarjeta del corte vigente', async () => {
    const user = await createVerifiedUser(app, 'cashflow-card');
    const today = todayInTimeZone('America/Mexico_City');
    const cutDay = Number(today.slice(8, 10));
    const card = await createCard(app, user.accessToken, {
      cutDay,
      openingBalance: 100000,
    });

    const projection = await request(app.getHttpServer())
      .get('/api/v1/cashflow/projection?days=60')
      .set(...authHeader(user.accessToken))
      .expect(200);

    const statementEvent = projection.body.points
      .flatMap((point: { events: { type: string; cardId?: string; amount: number }[] }) => point.events)
      .find((event: { type: string; cardId?: string }) => event.type === 'CARD_STATEMENT' && event.cardId === card.id);

    expect(statementEvent).toBeDefined();
    expect(statementEvent.amount).toBe(-100000);
  });

  it('devuelve el saldo inicial como minimo cuando no hay eventos', async () => {
    const user = await createVerifiedUser(app, 'cashflow-empty');
    await createCashAccount(app, user.accessToken, { openingBalance: 250000 });

    const projection = await request(app.getHttpServer())
      .get('/api/v1/cashflow/projection')
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(projection.body.points).toEqual([]);
    expect(projection.body.minimum).toEqual({
      date: projection.body.today,
      balance: 250000,
    });
    expect(projection.body.startingBalance).toBe(250000);
    expect(projection.body.belowBuffer).toBe(false);
  });

  it('valida el horizonte y exige autenticacion', async () => {
    await request(app.getHttpServer()).get('/api/v1/cashflow/projection').expect(401);

    const user = await createVerifiedUser(app, 'cashflow-days');
    await request(app.getHttpServer())
      .get('/api/v1/cashflow/projection?days=0')
      .set(...authHeader(user.accessToken))
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/cashflow/projection?days=400')
      .set(...authHeader(user.accessToken))
      .expect(400);
  });

  it('RN-29: sin days el horizonte cubre la ultima mensualidad y suma ingresos hasta ahi', async () => {
    const user = await createVerifiedUser(app, 'cashflow-msi');
    const today = todayInTimeZone('America/Mexico_City');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 500000 });
    const card = await createCard(app, user.accessToken, { creditLimit: 5000000 });

    await request(app.getHttpServer())
      .post('/api/v1/income/sources')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Sueldo',
        cashAccountId: account.id,
        estimatedAmount: 2000000,
        schedules: [
          {
            frequency: 'MONTHLY',
            config: { day: 1 },
            nonBusinessDayRule: 'NONE',
            startDate: today,
          },
        ],
      })
      .expect(201);

    const purchase = await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .send({
        creditCardId: card.id,
        description: 'Compra a 24 MSI',
        amount: 2400000,
        purchaseDate: today,
        type: 'MSI',
        months: 24,
      })
      .expect(201);

    const installments = purchase.body.installmentPlan.installments as Array<{ dueDate: string }>;
    const lastDueDate = installments[installments.length - 1].dueDate;

    const projection = await request(app.getHttpServer())
      .get('/api/v1/cashflow/projection')
      .set(...authHeader(user.accessToken))
      .expect(200);

    // El horizonte cubre el plan completo (24 meses), muy por encima de 60.
    expect(projection.body.horizonDays).toBeGreaterThanOrEqual(daysBetween(today, lastDueDate));
    expect(projection.body.horizonDays).toBeGreaterThan(365);

    const datedEvents = projection.body.points.flatMap(
      (point: { date: string; events: Array<Record<string, unknown>> }) =>
        point.events.map((event) => ({ date: point.date, ...event })),
    );
    const lastInstallment = datedEvents
      .filter((event: { type: string }) => event.type === 'INSTALLMENT')
      .at(-1);
    expect(lastInstallment.date).toBe(lastDueDate);

    // Los ingresos se generan hasta el final: el ultimo cae a <= 31 dias.
    const lastIncome = datedEvents
      .filter((event: { type: string }) => event.type === 'INCOME')
      .at(-1);
    expect(lastIncome).toBeDefined();
    expect(daysBetween(lastIncome.date, lastDueDate)).toBeLessThanOrEqual(31);

    // Un `days` explicito sigue mandando.
    const explicit = await request(app.getHttpServer())
      .get('/api/v1/cashflow/projection?days=30')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(explicit.body.horizonDays).toBe(30);
  });
});
