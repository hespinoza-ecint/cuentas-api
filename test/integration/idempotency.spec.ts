import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { todayInTimeZone } from '../../src/domain/shared/local-date';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import {
  authHeader,
  createCard,
  createCashAccount,
  createVerifiedUser,
} from '../helpers/api';
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

  it('una reserva en curso responde 409 y no ejecuta dos veces', async () => {
    const user = await createVerifiedUser(app, 'idempotency-progress');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 100000 });
    const today = todayInTimeZone('America/Mexico_City');
    const key = randomUUID();

    const prisma = app.get(PrismaService);
    await prisma.idempotencyRecord.create({
      data: {
        userId: user.userId,
        key,
        method: 'POST',
        path: '/api/v1/cash-movements/adjustments',
        requestHash: 'en-curso',
        status: 'IN_PROGRESS',
        responseStatus: 0,
        responseBody: '',
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/cash-movements/adjustments')
      .set(...authHeader(user.accessToken))
      .set('Idempotency-Key', key)
      .send({
        cashAccountId: account.id,
        amount: -1000,
        occurredOn: today,
        description: 'En curso',
        reason: 'Prueba',
      })
      .expect(409);
    expect(response.body.reason).toBe('IDEMPOTENCY_IN_PROGRESS');

    const movements = await request(app.getHttpServer())
      .get(`/api/v1/cash-movements?cashAccountId=${account.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(movements.body.data).toHaveLength(1); // solo OPENING_BALANCE
  });

  it('un registro vencido se vuelve a ejecutar en lugar de repetir la respuesta', async () => {
    const user = await createVerifiedUser(app, 'idempotency-expired');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 100000 });
    const today = todayInTimeZone('America/Mexico_City');
    const key = randomUUID();

    const prisma = app.get(PrismaService);
    await prisma.idempotencyRecord.create({
      data: {
        userId: user.userId,
        key,
        method: 'POST',
        path: '/api/v1/cash-movements/adjustments',
        requestHash: 'viejo',
        status: 'COMPLETED',
        responseStatus: 201,
        responseBody: JSON.stringify({ id: 'viejo', marker: 'replay' }),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const created = await request(app.getHttpServer())
      .post('/api/v1/cash-movements/adjustments')
      .set(...authHeader(user.accessToken))
      .set('Idempotency-Key', key)
      .send({
        cashAccountId: account.id,
        amount: -1000,
        occurredOn: today,
        description: 'Vencido',
        reason: 'Prueba',
      })
      .expect(201);

    expect(created.body.marker).toBeUndefined();
    expect(created.body.amount).toBe(-1000);
  });

  it('la transferencia, los gastos y la confirmacion de recurrentes aceptan Idempotency-Key', async () => {
    const user = await createVerifiedUser(app, 'idempotency-routes');
    const from = await createCashAccount(app, user.accessToken, { openingBalance: 500000 });
    const to = await createCashAccount(app, user.accessToken);
    const today = todayInTimeZone('America/Mexico_City');

    // Transferencia: el reintento no mueve el dinero dos veces.
    const transferKey = randomUUID();
    const transferBody = {
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: 100000,
      occurredOn: today,
      description: 'Traspaso idempotente',
    };

    await request(app.getHttpServer())
      .post('/api/v1/cash-accounts/transfer')
      .set(...authHeader(user.accessToken))
      .set('Idempotency-Key', transferKey)
      .send(transferBody)
      .expect(201);

    const transferReplay = await request(app.getHttpServer())
      .post('/api/v1/cash-accounts/transfer')
      .set(...authHeader(user.accessToken))
      .set('Idempotency-Key', transferKey)
      .send(transferBody)
      .expect(201);
    expect(transferReplay.headers['x-idempotent-replay']).toBe('true');

    const fromAfter = await request(app.getHttpServer())
      .get(`/api/v1/cash-accounts/${from.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(fromAfter.body.currentBalance).toBe(400000);

    // Gasto: el reintento devuelve el mismo gasto.
    const expenseKey = randomUUID();
    const expenseBody = {
      cashAccountId: from.id,
      description: 'Gasto idempotente',
      amount: 5000,
      expenseDate: today,
    };

    const first = await request(app.getHttpServer())
      .post('/api/v1/expenses')
      .set(...authHeader(user.accessToken))
      .set('Idempotency-Key', expenseKey)
      .send(expenseBody)
      .expect(201);

    const expenseReplay = await request(app.getHttpServer())
      .post('/api/v1/expenses')
      .set(...authHeader(user.accessToken))
      .set('Idempotency-Key', expenseKey)
      .send(expenseBody)
      .expect(201);
    expect(expenseReplay.body.id).toBe(first.body.id);
    expect(expenseReplay.headers['x-idempotent-replay']).toBe('true');

    // Confirmacion de un recurrente con tarjeta: el reintento devuelve la misma compra.
    const card = await createCard(app, user.accessToken);
    const recurringKey = randomUUID();
    const created = await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Renta',
        amount: 50000,
        paymentMethod: 'CREDIT_CARD',
        creditCardId: card.id,
        schedule: {
          frequency: 'CUSTOM',
          config: { specificDates: [today] },
          nonBusinessDayRule: 'NONE',
          startDate: today,
        },
      })
      .expect(201);

    const confirmBody = { occurrenceDate: today };
    const confirmed = await request(app.getHttpServer())
      .post(`/api/v1/recurring-expenses/${created.body.id}/confirm`)
      .set(...authHeader(user.accessToken))
      .set('Idempotency-Key', recurringKey)
      .send(confirmBody)
      .expect(201);

    const confirmReplay = await request(app.getHttpServer())
      .post(`/api/v1/recurring-expenses/${created.body.id}/confirm`)
      .set(...authHeader(user.accessToken))
      .set('Idempotency-Key', recurringKey)
      .send(confirmBody)
      .expect(201);
    expect(confirmReplay.body.purchaseId).toBe(confirmed.body.purchaseId);
    expect(confirmReplay.headers['x-idempotent-replay']).toBe('true');
  });
});
