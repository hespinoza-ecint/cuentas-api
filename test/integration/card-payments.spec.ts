import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { addDays, todayInTimeZone } from '../../src/domain/shared/local-date';
import {
  authHeader,
  createCard,
  createCashAccount,
  createVerifiedUser,
} from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Pagos de tarjeta (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  function cutDayFrom(date: string): number {
    return Number(date.slice(8, 10));
  }

  async function setupCardWithStatement(openingBalance: number, backdateDays = 10) {
    const user = await createVerifiedUser(app, 'card-payment');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 1000000 });
    const today = todayInTimeZone('America/Mexico_City');
    const openingDate = addDays(today, -backdateDays);
    const card = await createCard(app, user.accessToken, {
      openingBalance,
      openingDate,
      cutDay: cutDayFrom(openingDate),
      dueDaysAfterCut: 20,
    });
    const statements = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}/statements`)
      .set(...authHeader(user.accessToken))
      .expect(200);

    return { user, account, card, statement: statements.body[0], today };
  }

  it('paga el total del corte y libera credito (RN-23)', async () => {
    const { user, account, card, statement, today } = await setupCardWithStatement(500000);

    const response = await request(app.getHttpServer())
      .post('/api/v1/card-payments')
      .set(...authHeader(user.accessToken))
      .send({
        creditCardId: card.id,
        cashAccountId: account.id,
        amount: 500000,
        paymentDate: today,
      })
      .expect(201);

    expect(response.body.payment.status).toBe('APPLIED');
    expect(response.body.payment.type).toBe('STATEMENT');
    expect(response.body.allocations).toEqual([
      { targetType: 'STATEMENT', amount: 500000 },
    ]);

    const [cardAfter, accountAfter, statementAfter] = await Promise.all([
      request(app.getHttpServer())
        .get(`/api/v1/cards/${card.id}`)
        .set(...authHeader(user.accessToken))
        .expect(200),
      request(app.getHttpServer())
        .get(`/api/v1/cash-accounts/${account.id}`)
        .set(...authHeader(user.accessToken))
        .expect(200),
      request(app.getHttpServer())
        .get(`/api/v1/cards/${card.id}/statements/${statement.id}`)
        .set(...authHeader(user.accessToken))
        .expect(200),
    ]);

    expect(cardAfter.body.currentBalance).toBe(0);
    expect(cardAfter.body.availableCredit).toBe(2000000);
    expect(accountAfter.body.currentBalance).toBe(500000);
    expect(statementAfter.body.status).toBe('PAID');
    expect(statementAfter.body.paidAmount).toBe(500000);
  });

  it('acepta pagos parciales y los revierte restaurando saldos', async () => {
    const { user, account, card, statement, today } = await setupCardWithStatement(500000);

    const payment = await request(app.getHttpServer())
      .post('/api/v1/card-payments')
      .set(...authHeader(user.accessToken))
      .send({
        creditCardId: card.id,
        cashAccountId: account.id,
        amount: 200000,
        paymentDate: today,
      })
      .expect(201);

    const partial = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}/statements/${statement.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(partial.body.status).toBe('PARTIALLY_PAID');
    expect(partial.body.paidAmount).toBe(200000);

    await request(app.getHttpServer())
      .post(`/api/v1/card-payments/${payment.body.payment.id}/reverse`)
      .set(...authHeader(user.accessToken))
      .send({ reason: 'Pago duplicado' })
      .expect(201);

    const [cardAfter, accountAfter, statementAfter] = await Promise.all([
      request(app.getHttpServer())
        .get(`/api/v1/cards/${card.id}`)
        .set(...authHeader(user.accessToken))
        .expect(200),
      request(app.getHttpServer())
        .get(`/api/v1/cash-accounts/${account.id}`)
        .set(...authHeader(user.accessToken))
        .expect(200),
      request(app.getHttpServer())
        .get(`/api/v1/cards/${card.id}/statements/${statement.id}`)
        .set(...authHeader(user.accessToken))
        .expect(200),
    ]);

    expect(cardAfter.body.currentBalance).toBe(500000);
    expect(accountAfter.body.currentBalance).toBe(1000000);
    expect(statementAfter.body.paidAmount).toBe(0);
    expect(statementAfter.body.status).toBe('CLOSED');

    const second = await request(app.getHttpServer())
      .post(`/api/v1/card-payments/${payment.body.payment.id}/reverse`)
      .set(...authHeader(user.accessToken))
      .send({ reason: 'Otra vez' })
      .expect(409);
    expect(second.body.reason).toBe('PAYMENT_ALREADY_REVERSED');
  });

  it('aplica al saldo revolvente cuando aun no hay cortes', async () => {
    const user = await createVerifiedUser(app, 'card-payment-revolving');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 500000 });
    const card = await createCard(app, user.accessToken, { openingBalance: 300000 });
    const today = todayInTimeZone('America/Mexico_City');

    const response = await request(app.getHttpServer())
      .post('/api/v1/card-payments')
      .set(...authHeader(user.accessToken))
      .send({
        creditCardId: card.id,
        cashAccountId: account.id,
        amount: 100000,
        paymentDate: today,
      })
      .expect(201);

    expect(response.body.payment.type).toBe('PARTIAL');
    expect(response.body.allocations).toEqual([
      { targetType: 'REVOLVING', amount: 100000 },
    ]);
  });

  it('rechaza pagos invalidos y aisla las tarjetas entre usuarios', async () => {
    const { user, account, card, today } = await setupCardWithStatement(500000);

    const tooMuch = await request(app.getHttpServer())
      .post('/api/v1/card-payments')
      .set(...authHeader(user.accessToken))
      .send({
        creditCardId: card.id,
        cashAccountId: account.id,
        amount: 600000,
        paymentDate: today,
      })
      .expect(422);
    expect(tooMuch.body.reason).toBe('PAYMENT_EXCEEDS_BALANCE');

    const otherUser = await createVerifiedUser(app, 'card-payment-iso');
    await request(app.getHttpServer())
      .post('/api/v1/card-payments')
      .set(...authHeader(otherUser.accessToken))
      .send({
        creditCardId: card.id,
        cashAccountId: account.id,
        amount: 1000,
        paymentDate: today,
      })
      .expect(404);
  });
});
