import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import {
  addDays,
  compareLocalDates,
  dayOfWeek,
  todayInTimeZone,
} from '../../src/domain/shared/local-date';
import { authHeader, createCashAccount, createVerifiedUser } from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Gastos recurrentes (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  function nextSaturday(from: string): string {
    let cursor = addDays(from, 7);
    while (dayOfWeek(cursor) !== 6) {
      cursor = addDays(cursor, 1);
    }
    return cursor;
  }

  it('calcula la proxima ocurrencia ajustando el fin de semana', async () => {
    const user = await createVerifiedUser(app, 'recurring');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 300000 });
    const today = todayInTimeZone('America/Mexico_City');
    const saturday = nextSaturday(today);

    const created = await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Renta',
        amount: 120000,
        cashAccountId: account.id,
        schedule: {
          frequency: 'CUSTOM',
          config: { specificDates: [saturday] },
          nonBusinessDayRule: 'PREVIOUS',
          startDate: today,
        },
      })
      .expect(201);

    const upcoming = await request(app.getHttpServer())
      .get('/api/v1/recurring-expenses/upcoming?days=120')
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(upcoming.body.occurrences).toHaveLength(1);
    const occurrence = upcoming.body.occurrences[0];
    expect(occurrence.recurringExpenseId).toBe(created.body.id);
    expect(occurrence.expectedDate).not.toBe(saturday);
    expect(compareLocalDates(occurrence.expectedDate, saturday)).toBeLessThan(0);
    expect([0, 6]).not.toContain(dayOfWeek(occurrence.expectedDate));
  });

  it('confirma una ocurrencia generando el gasto y su movimiento', async () => {
    const user = await createVerifiedUser(app, 'recurring-confirm');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 100000 });
    const today = todayInTimeZone('America/Mexico_City');

    const created = await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Internet',
        amount: 80000,
        cashAccountId: account.id,
        schedule: {
          frequency: 'CUSTOM',
          config: { specificDates: [today] },
          nonBusinessDayRule: 'NONE',
          startDate: today,
        },
      })
      .expect(201);

    const confirmation = await request(app.getHttpServer())
      .post(`/api/v1/recurring-expenses/${created.body.id}/confirm`)
      .set(...authHeader(user.accessToken))
      .send({ occurrenceDate: today })
      .expect(201);

    expect(confirmation.body.expenseId).toEqual(expect.any(String));

    const accountAfter = await request(app.getHttpServer())
      .get(`/api/v1/cash-accounts/${account.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(accountAfter.body.currentBalance).toBe(20000);

    const upcoming = await request(app.getHttpServer())
      .get('/api/v1/recurring-expenses/upcoming?days=60')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(upcoming.body.occurrences).toHaveLength(0);

    const duplicate = await request(app.getHttpServer())
      .post(`/api/v1/recurring-expenses/${created.body.id}/confirm`)
      .set(...authHeader(user.accessToken))
      .send({ occurrenceDate: today })
      .expect(409);
    expect(duplicate.body.reason).toBe('OCCURRENCE_ALREADY_CONFIRMED');
  });

  it('desactiva y elimina logicamente un gasto recurrente', async () => {
    const user = await createVerifiedUser(app, 'recurring-delete');
    const account = await createCashAccount(app, user.accessToken);

    const created = await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Suscripcion',
        amount: 20000,
        cashAccountId: account.id,
        schedule: { frequency: 'MONTHLY', config: { day: 15 }, startDate: '2026-01-01' },
      })
      .expect(201);

    // Desactivado: no aparece en la lista activa, si con includeInactive.
    await request(app.getHttpServer())
      .patch(`/api/v1/recurring-expenses/${created.body.id}`)
      .set(...authHeader(user.accessToken))
      .send({ isActive: false })
      .expect(200);

    const active = await request(app.getHttpServer())
      .get('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(active.body).toHaveLength(0);

    const includeInactive = await request(app.getHttpServer())
      .get('/api/v1/recurring-expenses?includeInactive=true')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(includeInactive.body).toHaveLength(1);
    expect(includeInactive.body[0].isActive).toBe(false);

    // Eliminado (borrado logico): desaparece incluso con includeInactive.
    await request(app.getHttpServer())
      .delete(`/api/v1/recurring-expenses/${created.body.id}`)
      .set(...authHeader(user.accessToken))
      .expect(204);

    const afterDelete = await request(app.getHttpServer())
      .get('/api/v1/recurring-expenses?includeInactive=true')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(afterDelete.body).toHaveLength(0);
  });
});
