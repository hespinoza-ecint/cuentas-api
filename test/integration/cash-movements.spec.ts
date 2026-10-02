import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { addDays, todayInTimeZone } from '../../src/domain/shared/local-date';
import {
  authHeader,
  createCashAccount,
  createVerifiedUser,
} from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Movimientos de efectivo (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('registra un ajuste manual con motivo y actualiza el saldo', async () => {
    const user = await createVerifiedUser(app, 'adjust');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 100000 });
    const today = todayInTimeZone('America/Mexico_City');

    const response = await request(app.getHttpServer())
      .post('/api/v1/cash-movements/adjustments')
      .set(...authHeader(user.accessToken))
      .send({
        cashAccountId: account.id,
        amount: -15000,
        occurredOn: today,
        description: 'Correccion de conteo',
        reason: 'Diferencia contra el estado de cuenta',
      })
      .expect(201);

    expect(response.body.type).toBe('ADJUSTMENT');
    expect(response.body.amount).toBe(-15000);

    const accountAfter = await request(app.getHttpServer())
      .get(`/api/v1/cash-accounts/${account.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(accountAfter.body.currentBalance).toBe(85000);
  });

  it('revierte un movimiento una sola vez', async () => {
    const user = await createVerifiedUser(app, 'reverse');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 50000 });
    const today = todayInTimeZone('America/Mexico_City');

    const adjustment = await request(app.getHttpServer())
      .post('/api/v1/cash-movements/adjustments')
      .set(...authHeader(user.accessToken))
      .send({
        cashAccountId: account.id,
        amount: -10000,
        occurredOn: today,
        description: 'Ajuste temporal',
        reason: 'Prueba de reverso',
      })
      .expect(201);

    const reversal = await request(app.getHttpServer())
      .post(`/api/v1/cash-movements/${adjustment.body.id}/reverse`)
      .set(...authHeader(user.accessToken))
      .send({ reason: 'Se registro por error' })
      .expect(201);

    expect(reversal.body.type).toBe('REVERSAL');
    expect(reversal.body.amount).toBe(10000);

    const accountAfter = await request(app.getHttpServer())
      .get(`/api/v1/cash-accounts/${account.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(accountAfter.body.currentBalance).toBe(50000);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/cash-movements/${adjustment.body.id}/reverse`)
      .set(...authHeader(user.accessToken))
      .send({ reason: 'Otra vez' })
      .expect(409);
    expect(second.body.reason).toBe('ALREADY_REVERSED');
  });

  it('rechaza fechas futuras y fechas fuera del limite de registro', async () => {
    const user = await createVerifiedUser(app, 'dates');
    const account = await createCashAccount(app, user.accessToken);
    const today = todayInTimeZone('America/Mexico_City');

    const future = await request(app.getHttpServer())
      .post('/api/v1/cash-movements/adjustments')
      .set(...authHeader(user.accessToken))
      .send({
        cashAccountId: account.id,
        amount: 1000,
        occurredOn: addDays(today, 1),
        description: 'Futuro',
        reason: 'No permitido',
      })
      .expect(422);
    expect(future.body.reason).toBe('FUTURE_DATE_NOT_ALLOWED');

    const tooOld = await request(app.getHttpServer())
      .post('/api/v1/cash-movements/adjustments')
      .set(...authHeader(user.accessToken))
      .send({
        cashAccountId: account.id,
        amount: 1000,
        occurredOn: addDays(today, -61),
        description: 'Muy viejo',
        reason: 'No permitido',
      })
      .expect(422);
    expect(tooOld.body.reason).toBe('BACKDATE_LIMIT_EXCEEDED');
  });

  it('lista movimientos con paginacion por cursor y aislamiento por usuario', async () => {
    const user = await createVerifiedUser(app, 'list');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 100000 });
    const today = todayInTimeZone('America/Mexico_City');

    for (let index = 1; index <= 3; index += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/cash-movements/adjustments')
        .set(...authHeader(user.accessToken))
        .send({
          cashAccountId: account.id,
          amount: index * -1000,
          occurredOn: today,
          description: `Ajuste ${index}`,
          reason: 'Prueba de paginacion',
        })
        .expect(201);
    }

    const firstPage = await request(app.getHttpServer())
      .get(`/api/v1/cash-movements?cashAccountId=${account.id}&limit=2`)
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(firstPage.body.data).toHaveLength(2);
    expect(firstPage.body.meta.nextCursor).toEqual(expect.any(String));
    expect(firstPage.body.meta.hasMore).toBe(true);

    const secondPage = await request(app.getHttpServer())
      .get(
        `/api/v1/cash-movements?cashAccountId=${account.id}&limit=2&cursor=${firstPage.body.meta.nextCursor}`,
      )
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(secondPage.body.data).toHaveLength(2);
    expect(secondPage.body.meta.hasMore).toBe(false);

    const movementId = firstPage.body.data[0].id as string;
    const otherUser = await createVerifiedUser(app, 'list-other');
    await request(app.getHttpServer())
      .get(`/api/v1/cash-movements/${movementId}`)
      .set(...authHeader(otherUser.accessToken))
      .expect(404);
  });
});
