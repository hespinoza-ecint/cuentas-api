import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { todayInTimeZone } from '../../src/domain/shared/local-date';
import { authHeader, createCashAccount, createVerifiedUser } from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Idempotencia de POST financieros (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('un reintento con la misma llave no duplica el movimiento', async () => {
    const user = await createVerifiedUser(app, 'idempotency');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 100000 });
    const today = todayInTimeZone('America/Mexico_City');
    const key = randomUUID();

    const body = {
      cashAccountId: account.id,
      amount: -5000,
      occurredOn: today,
      description: 'Ajuste idempotente',
      reason: 'Prueba de idempotencia',
    };

    const first = await request(app.getHttpServer())
      .post('/api/v1/cash-movements/adjustments')
      .set(...authHeader(user.accessToken))
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

    const replay = await request(app.getHttpServer())
      .post('/api/v1/cash-movements/adjustments')
      .set(...authHeader(user.accessToken))
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

    expect(replay.body.id).toBe(first.body.id);
    expect(replay.headers['x-idempotent-replay']).toBe('true');

    const movements = await request(app.getHttpServer())
      .get(`/api/v1/cash-movements?cashAccountId=${account.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(movements.body.data).toHaveLength(2); // OPENING_BALANCE + un solo ajuste
  });

  it('rechaza reutilizar la llave con un cuerpo distinto', async () => {
    const user = await createVerifiedUser(app, 'idempotency-conflict');
    const account = await createCashAccount(app, user.accessToken);
    const today = todayInTimeZone('America/Mexico_City');
    const key = randomUUID();

    await request(app.getHttpServer())
      .post('/api/v1/cash-movements/adjustments')
      .set(...authHeader(user.accessToken))
      .set('Idempotency-Key', key)
      .send({
        cashAccountId: account.id,
        amount: 1000,
        occurredOn: today,
        description: 'Primero',
        reason: 'Prueba',
      })
      .expect(201);

    const conflict = await request(app.getHttpServer())
      .post('/api/v1/cash-movements/adjustments')
      .set(...authHeader(user.accessToken))
      .set('Idempotency-Key', key)
      .send({
        cashAccountId: account.id,
        amount: 2000,
        occurredOn: today,
        description: 'Diferente',
        reason: 'Prueba',
      })
      .expect(409);

    expect(conflict.body.reason).toBe('IDEMPOTENCY_KEY_CONFLICT');
  });

  it('sin cabecera la operacion se procesa normalmente (la llave es opcional)', async () => {
    const user = await createVerifiedUser(app, 'idempotency-optional');
    const account = await createCashAccount(app, user.accessToken);
    const today = todayInTimeZone('America/Mexico_City');

    await request(app.getHttpServer())
      .post('/api/v1/cash-movements/adjustments')
      .set(...authHeader(user.accessToken))
      .send({
        cashAccountId: account.id,
        amount: 1000,
        occurredOn: today,
        description: 'Sin llave',
        reason: 'Prueba',
      })
      .expect(201);

    const invalid = await request(app.getHttpServer())
      .post('/api/v1/cash-movements/adjustments')
      .set(...authHeader(user.accessToken))
      .set('Idempotency-Key', 'corta')
      .send({
        cashAccountId: account.id,
        amount: 1000,
        occurredOn: today,
        description: 'Llave invalida',
        reason: 'Prueba',
      })
      .expect(400);
    expect(invalid.body.reason).toBe('IDEMPOTENCY_KEY_INVALID');
  });
});
