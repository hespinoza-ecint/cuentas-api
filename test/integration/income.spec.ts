import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import {
  addDays,
  dayOfWeek,
  todayInTimeZone,
} from '../../src/domain/shared/local-date';
import {
  authHeader,
  CashAccountFixture,
  createCashAccount,
  TestUser,
  createVerifiedUser,
} from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Ingresos (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function createSource(
    user: TestUser,
    account: CashAccountFixture,
    body: Record<string, unknown>,
  ) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/income/sources')
      .set(...authHeader(user.accessToken))
      .send({ cashAccountId: account.id, ...body })
      .expect(201);
    return response.body;
  }

  it('RN-08: la quincena por defecto es 15 y ultimo del mes', async () => {
    const user = await createVerifiedUser(app, 'income-biweekly');
    const account = await createCashAccount(app, user.accessToken);
    const today = todayInTimeZone('America/Mexico_City');

    const source = await createSource(user, account, {
      name: 'Sueldo',
      estimatedAmount: 1500000,
      schedules: [{ frequency: 'BIWEEKLY', startDate: today }],
    });

    expect(source.schedules).toHaveLength(1);
    expect(source.schedules[0].config).toEqual({ days: [15, 'LAST'] });
    expect(source.schedules[0].nonBusinessDayRule).toBe('PREVIOUS');

    const upcoming = await request(app.getHttpServer())
      .get('/api/v1/income/upcoming?days=90')
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(upcoming.body.occurrences.length).toBeGreaterThan(0);
    for (const occurrence of upcoming.body.occurrences) {
      expect(occurrence.incomeSourceId).toBe(source.id);
      // RN-09: con regla PREVIOUS ninguna fecha cae en fin de semana.
      expect([0, 6]).not.toContain(dayOfWeek(occurrence.expectedDate));
    }
  });

  it('RN-10: los ingresos variables se proyectan con el factor conservador', async () => {
    const user = await createVerifiedUser(app, 'income-variable');
    const account = await createCashAccount(app, user.accessToken);
    const today = todayInTimeZone('America/Mexico_City');
    const futureDate = addDays(today, 5);

    await createSource(user, account, {
      name: 'Freelance',
      amountType: 'VARIABLE',
      estimatedAmount: 100000,
      schedules: [
        {
          frequency: 'CUSTOM',
          config: { specificDates: [futureDate] },
          nonBusinessDayRule: 'NONE',
          startDate: today,
        },
      ],
    });

    const upcoming = await request(app.getHttpServer())
      .get('/api/v1/income/upcoming?days=30')
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(upcoming.body.occurrences).toHaveLength(1);
    expect(upcoming.body.occurrences[0].expectedAmount).toBe(90000);
  });

  it('RN-11: las fechas vencidas dejan de proyectarse despues de los dias de gracia', async () => {
    const user = await createVerifiedUser(app, 'income-grace');
    const account = await createCashAccount(app, user.accessToken);
    const today = todayInTimeZone('America/Mexico_City');

    await createSource(user, account, {
      name: 'Renta cobrada',
      estimatedAmount: 500000,
      schedules: [
        {
          frequency: 'CUSTOM',
          config: { specificDates: [addDays(today, -10), addDays(today, -2)] },
          nonBusinessDayRule: 'NONE',
          startDate: addDays(today, -30),
        },
      ],
    });

    const upcoming = await request(app.getHttpServer())
      .get('/api/v1/income/upcoming?days=30')
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(upcoming.body.graceDays).toBe(3);
    expect(upcoming.body.occurrences).toHaveLength(1);
    expect(upcoming.body.occurrences[0].expectedDate).toBe(addDays(today, -2));
    expect(upcoming.body.occurrences[0].overdue).toBe(true);
  });

  it('confirma un ingreso real distinto del estimado y actualiza el saldo', async () => {
    const user = await createVerifiedUser(app, 'income-confirm');
    const account = await createCashAccount(app, user.accessToken);
    const today = todayInTimeZone('America/Mexico_City');

    const source = await createSource(user, account, {
      name: 'Sueldo quincenal',
      estimatedAmount: 1000000,
      schedules: [
        {
          frequency: 'CUSTOM',
          config: { specificDates: [today] },
          nonBusinessDayRule: 'NONE',
          startDate: today,
        },
      ],
    });

    const confirmation = await request(app.getHttpServer())
      .post('/api/v1/income/transactions/confirm')
      .set(...authHeader(user.accessToken))
      .send({
        incomeSourceId: source.id,
        incomeScheduleId: source.schedules[0].id,
        expectedDate: today,
        actualAmount: 1150000,
      })
      .expect(201);

    expect(confirmation.body.status).toBe('CONFIRMED');
    expect(confirmation.body.actualAmount).toBe(1150000);

    const accountAfter = await request(app.getHttpServer())
      .get(`/api/v1/cash-accounts/${account.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(accountAfter.body.currentBalance).toBe(1150000);

    const upcoming = await request(app.getHttpServer())
      .get('/api/v1/income/upcoming?days=30')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(upcoming.body.occurrences).toHaveLength(0);

    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/income/transactions/confirm')
      .set(...authHeader(user.accessToken))
      .send({
        incomeSourceId: source.id,
        incomeScheduleId: source.schedules[0].id,
        expectedDate: today,
      })
      .expect(409);
    expect(duplicate.body.reason).toBe('OCCURRENCE_ALREADY_REGISTERED');

    const history = await request(app.getHttpServer())
      .get('/api/v1/income/transactions?status=CONFIRMED')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0].incomeSource.name).toBe('Sueldo quincenal');
  });

  it('omite una fecha y deja de proyectarla', async () => {
    const user = await createVerifiedUser(app, 'income-skip');
    const account = await createCashAccount(app, user.accessToken);
    const today = todayInTimeZone('America/Mexico_City');
    const futureDate = addDays(today, 3);

    const source = await createSource(user, account, {
      name: 'Bono',
      estimatedAmount: 300000,
      schedules: [
        {
          frequency: 'CUSTOM',
          config: { specificDates: [futureDate] },
          nonBusinessDayRule: 'NONE',
          startDate: today,
        },
      ],
    });

    await request(app.getHttpServer())
      .post('/api/v1/income/transactions/skip')
      .set(...authHeader(user.accessToken))
      .send({
        incomeSourceId: source.id,
        incomeScheduleId: source.schedules[0].id,
        expectedDate: futureDate,
      })
      .expect(201);

    const upcoming = await request(app.getHttpServer())
      .get('/api/v1/income/upcoming?days=30')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(upcoming.body.occurrences).toHaveLength(0);

    const history = await request(app.getHttpServer())
      .get('/api/v1/income/transactions?status=SKIPPED')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(history.body.data).toHaveLength(1);
  });

  it('aisla las fuentes de ingreso entre usuarios', async () => {
    const userA = await createVerifiedUser(app, 'income-iso-a');
    const userB = await createVerifiedUser(app, 'income-iso-b');
    const accountA = await createCashAccount(app, userA.accessToken);
    const today = todayInTimeZone('America/Mexico_City');

    const source = await createSource(userA, accountA, {
      name: 'Privada',
      estimatedAmount: 100000,
      schedules: [
        {
          frequency: 'CUSTOM',
          config: { specificDates: [addDays(today, 2)] },
          nonBusinessDayRule: 'NONE',
          startDate: today,
        },
      ],
    });

    await request(app.getHttpServer())
      .get(`/api/v1/income/sources/${source.id}`)
      .set(...authHeader(userB.accessToken))
      .expect(404);

    await request(app.getHttpServer())
      .post('/api/v1/income/transactions/confirm')
      .set(...authHeader(userB.accessToken))
      .send({
        incomeSourceId: source.id,
        incomeScheduleId: source.schedules[0].id,
        expectedDate: addDays(today, 2),
      })
      .expect(404);
  });
});
