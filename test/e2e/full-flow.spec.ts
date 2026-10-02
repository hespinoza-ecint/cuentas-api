import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { todayInTimeZone } from '../../src/domain/shared/local-date';
import {
  authHeader,
  createCashAccount,
  loginUser,
  mailService,
  registerUser,
  TEST_PASSWORD,
  uniqueEmail,
} from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

/**
 * Prueba end-to-end: un ciclo de vida completo del usuario pasando por todas
 * las fases del backend (auth, efectivo, ingresos, tarjetas, compras,
 * recomendaciones, exportacion y eliminacion).
 */
describe('Flujo completo end-to-end', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('recorre registro, verificacion, finanzas, recomendacion y eliminacion', async () => {
    const today = todayInTimeZone('America/Mexico_City');
    const email = uniqueEmail('e2e');

    // 1) Registro y verificacion de correo.
    await registerUser(app, email, { firstName: 'Flujo', lastName: 'Completo' });
    const verificationToken = mailService(app).verificationTokenFor(email);
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: verificationToken })
      .expect(200);

    // 2) Login nativo.
    const session = await loginUser(app, email);
    const headers = authHeader(session.accessToken);

    // 3) Cuenta de efectivo con saldo inicial.
    const account = await createCashAccount(app, session.accessToken, { openingBalance: 2000000 });

    // 4) Fuente de ingreso quincenal (15 y ultimo).
    const incomeSource = await request(app.getHttpServer())
      .post('/api/v1/income/sources')
      .set(...headers)
      .send({
        name: 'Sueldo E2E',
        estimatedAmount: 1500000,
        cashAccountId: account.id,
        schedules: [{ frequency: 'BIWEEKLY', startDate: today }],
      })
      .expect(201);
    expect(incomeSource.body.schedules[0].config).toEqual({ days: [15, 'LAST'] });

    // 5) Tarjeta de credito.
    const card = await request(app.getHttpServer())
      .post('/api/v1/cards')
      .set(...headers)
      .send({
        alias: 'E2E Oro',
        institution: 'Banco E2E',
        last4: '7777',
        creditLimit: 3000000,
        cutDay: 15,
        dueDaysAfterCut: 20,
        annualRateBps: 3600,
      })
      .expect(201);

    // 6) Recomendacion para una compra.
    const recommendation = await request(app.getHttpServer())
      .post('/api/v1/recommendations')
      .set(...headers)
      .send({ amount: 300000, purchaseDate: today, type: 'REGULAR' })
      .expect(201);
    expect(recommendation.body.outcome).toBe('CARD');
    expect(recommendation.body.recommended.cardId).toBe(card.body.id);

    // 7) Compra a meses sin intereses ligada a la recomendacion.
    const purchase = await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set(...headers)
      .send({
        creditCardId: card.body.id,
        description: 'Compra E2E a 3 MSI',
        amount: 90000,
        purchaseDate: today,
        type: 'MSI',
        months: 3,
        recommendationId: recommendation.body.historyId,
      })
      .expect(201);
    expect(purchase.body.installmentPlan.installments).toHaveLength(3);

    // 8) Pago parcial a la tarjeta (saldo revolvente porque el corte aun no ocurre).
    const payment = await request(app.getHttpServer())
      .post('/api/v1/card-payments')
      .set(...headers)
      .send({
        creditCardId: card.body.id,
        cashAccountId: account.id,
        amount: 30000,
        paymentDate: today,
      })
      .expect(201);
    expect(payment.body.payment.status).toBe('APPLIED');

    // 9) Gasto en efectivo.
    const categoryList = await request(app.getHttpServer())
      .get('/api/v1/categories?kind=EXPENSE')
      .set(...headers)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/expenses')
      .set(...headers)
      .send({
        cashAccountId: account.id,
        categoryId: categoryList.body[0].id,
        description: 'Gasto E2E',
        amount: 25000,
        expenseDate: today,
      })
      .expect(201);

    // 10) Saldos coherentes: 2,000,000 - 30,000 - 25,000 = 1,945,000.
    const accountAfter = await request(app.getHttpServer())
      .get(`/api/v1/cash-accounts/${account.id}`)
      .set(...headers)
      .expect(200);
    expect(accountAfter.body.currentBalance).toBe(1945000);

    const cardAfter = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.body.id}`)
      .set(...headers)
      .expect(200);
    expect(cardAfter.body.currentBalance).toBe(60000);

    // 11) Exportacion de datos.
    const exported = await request(app.getHttpServer())
      .get('/api/v1/users/me/export')
      .set(...headers)
      .expect(200);
    expect(JSON.stringify(exported.body)).not.toContain('passwordHash');
    expect(exported.body.user.email).toBe(email);

    // 12) Cierre de sesion y eliminacion con contrasena.
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set(...headers).expect(204);

    const secondSession = await loginUser(app, email);
    await request(app.getHttpServer())
      .post('/api/v1/users/me/delete')
      .set(...authHeader(secondSession.accessToken))
      .send({ password: TEST_PASSWORD })
      .expect(200);

    const blockedLogin = await loginUser(app, email);
    const blocked = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set(...authHeader(blockedLogin.accessToken))
      .expect(403);
    expect(blocked.body.reason).toBe('PENDING_DELETION');

    // 13) Cancelacion de la eliminacion.
    await request(app.getHttpServer())
      .post('/api/v1/users/me/cancel-deletion')
      .set(...authHeader(blockedLogin.accessToken))
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set(...authHeader(blockedLogin.accessToken))
      .expect(200);
  });
});
