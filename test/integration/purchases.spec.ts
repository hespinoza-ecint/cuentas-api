import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { cutDateForPurchase } from '../../src/domain/cards/card-cycle';
import { addDays, addMonths, compareLocalDates, todayInTimeZone } from '../../src/domain/shared/local-date';
import {
  authHeader,
  createCard,
  createCashAccount,
  createVerifiedUser,
  TestUser,
} from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Compras y mensualidades (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function createPurchase(
    user: TestUser,
    body: Record<string, unknown>,
  ): Promise<Record<string, any>> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .send(body)
      .expect(201);
    return response.body;
  }

  it('registra una compra regular y ocupa credito disponible', async () => {
    const user = await createVerifiedUser(app, 'purchase-regular');
    const card = await createCard(app, user.accessToken, { creditLimit: 3000000 });
    const today = todayInTimeZone('America/Mexico_City');

    const purchase = await createPurchase(user, {
      creditCardId: card.id,
      description: 'Supermercado',
      amount: 100000,
      purchaseDate: today,
      type: 'REGULAR',
    });

    expect(purchase.type).toBe('REGULAR');
    expect(purchase.installmentPlan).toBeNull();

    const cardAfter = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(cardAfter.body.currentBalance).toBe(100000);
    expect(cardAfter.body.availableCredit).toBe(2900000);
  });

  it('RN-18 y RN-19: la compra a MSI ocupa todo el credito y la primera mensualidad es del corte de la compra', async () => {
    const user = await createVerifiedUser(app, 'purchase-msi');
    const today = todayInTimeZone('America/Mexico_City');
    const purchaseDate = addDays(today, -40);
    const cutDay = Number(purchaseDate.slice(8, 10));
    const card = await createCard(app, user.accessToken, {
      creditLimit: 3000000,
      cutDay,
      dueDaysAfterCut: 20,
    });

    const purchase = await createPurchase(user, {
      creditCardId: card.id,
      description: 'Telefono a meses',
      amount: 100000,
      purchaseDate,
      type: 'MSI',
      months: 3,
    });

    const plan = purchase.installmentPlan;
    expect(plan.months).toBe(3);
    expect(plan.totalInterest).toBe(0);
    expect(plan.installments).toHaveLength(3);

    const installmentSum = plan.installments.reduce(
      (sum: number, installment: { totalAmount: number }) => sum + installment.totalAmount,
      0,
    );
    expect(installmentSum).toBe(100000);
    expect(plan.installments.map((i: { totalAmount: number }) => i.totalAmount)).toEqual([
      33333, 33333, 33334,
    ]);

    const expectedFirstCut = cutDateForPurchase(cutDay, purchaseDate, true);
    expect(plan.installments[0].statementCutDate).toBe(expectedFirstCut);

    const cardAfter = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(cardAfter.body.currentBalance).toBe(100000);
    expect(cardAfter.body.availableCredit).toBe(2900000);

    // El corte pasado incluye la mensualidad exigible y no el monto total.
    const statements = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}/statements`)
      .set(...authHeader(user.accessToken))
      .expect(200);

    const firstStatement = statements.body.find(
      (statement: { cutDate: string }) => statement.cutDate === expectedFirstCut,
    );
    expect(firstStatement).toBeDefined();
    expect(firstStatement.noInterestPaymentCalc).toBe(33333);
    expect(firstStatement.cycleCharges).toBe(0);

    const purchaseAfter = await request(app.getHttpServer())
      .get(`/api/v1/purchases/${purchase.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(purchaseAfter.body.installmentPlan.installments[0].statementId).toBe(firstStatement.id);
    expect(purchaseAfter.body.installmentPlan.installments[0].status).toBe('BILLED');
  });

  it('RN-20: la compra diferida suma intereses e IVA sobre el principal', async () => {
    const user = await createVerifiedUser(app, 'purchase-deferred');
    const card = await createCard(app, user.accessToken, { creditLimit: 3000000 });
    const today = todayInTimeZone('America/Mexico_City');

    const purchase = await createPurchase(user, {
      creditCardId: card.id,
      description: 'Muebles diferidos',
      amount: 120000,
      purchaseDate: today,
      type: 'DEFERRED_INTEREST',
      months: 6,
      annualRateBps: 2400,
    });

    const plan = purchase.installmentPlan;
    expect(plan.totalInterest).toBeGreaterThan(0);

    const principalSum = plan.installments.reduce(
      (sum: number, installment: { principal: number }) => sum + installment.principal,
      0,
    );
    const totalSum = plan.installments.reduce(
      (sum: number, installment: { totalAmount: number }) => sum + installment.totalAmount,
      0,
    );

    expect(principalSum).toBe(120000);
    expect(totalSum).toBe(120000 + plan.totalInterest + plan.totalIva);
    expect(plan.installments[0].interest).toBeGreaterThan(0);
    expect(plan.installments[0].iva).toBe(Math.round(plan.installments[0].interest * 0.16));
  });

  it('valida los tipos de compra', async () => {
    const user = await createVerifiedUser(app, 'purchase-validation');
    const card = await createCard(app, user.accessToken);
    const today = todayInTimeZone('America/Mexico_City');

    const noMonths = await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .send({
        creditCardId: card.id,
        description: 'Sin meses',
        amount: 100000,
        purchaseDate: today,
        type: 'MSI',
      })
      .expect(400);
    expect(noMonths.body.reason).toBe('MONTHS_REQUIRED');

    const msiWithRate = await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .send({
        creditCardId: card.id,
        description: 'MSI con tasa',
        amount: 100000,
        purchaseDate: today,
        type: 'MSI',
        months: 6,
        annualRateBps: 1200,
      })
      .expect(400);
    expect(msiWithRate.body.reason).toBe('MSI_WITH_RATE');

    const deferredNoRate = await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .send({
        creditCardId: card.id,
        description: 'Diferida sin tasa',
        amount: 100000,
        purchaseDate: today,
        type: 'DEFERRED_INTEREST',
        months: 6,
      })
      .expect(400);
    expect(deferredNoRate.body.reason).toBe('RATE_REQUIRED');
  });

  it('cancela compras sin pagos y bloquea las que ya tienen mensualidades pagadas', async () => {
    const user = await createVerifiedUser(app, 'purchase-cancel');
    const card = await createCard(app, user.accessToken, { creditLimit: 3000000 });
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 500000 });
    const today = todayInTimeZone('America/Mexico_City');

    const purchase = await createPurchase(user, {
      creditCardId: card.id,
      description: 'Compra cancelable',
      amount: 60000,
      purchaseDate: today,
      type: 'MSI',
      months: 3,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/purchases/${purchase.id}/cancel`)
      .set(...authHeader(user.accessToken))
      .send({ reason: 'Devolucion completa' })
      .expect(201);

    const cardAfter = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(cardAfter.body.currentBalance).toBe(0);

    const purchaseAfter = await request(app.getHttpServer())
      .get(`/api/v1/purchases/${purchase.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(purchaseAfter.body.status).toBe('CANCELLED');
    expect(purchaseAfter.body.installmentPlan.status).toBe('CANCELLED');

    // Nueva compra: al pagar la primera mensualidad ya no se puede cancelar.
    const second = await createPurchase(user, {
      creditCardId: card.id,
      description: 'Compra con pago',
      amount: 90000,
      purchaseDate: today,
      type: 'MSI',
      months: 3,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/installment-plans/${second.installmentPlan.id}/prepay`)
      .set(...authHeader(user.accessToken))
      .send({ cashAccountId: account.id, amount: 30000, paymentDate: today })
      .expect(201);

    const blocked = await request(app.getHttpServer())
      .post(`/api/v1/purchases/${second.id}/cancel`)
      .set(...authHeader(user.accessToken))
      .send({ reason: 'Tarde' })
      .expect(422);
    expect(blocked.body.reason).toBe('PLAN_HAS_PAYMENTS');
  });

  it('RN-21: anticipos reducen plazo y liquidan el plan', async () => {
    const user = await createVerifiedUser(app, 'purchase-prepay');
    const card = await createCard(app, user.accessToken, { creditLimit: 3000000 });
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 500000 });
    const today = todayInTimeZone('America/Mexico_City');

    const purchase = await createPurchase(user, {
      creditCardId: card.id,
      description: 'Plan anticipable',
      amount: 90000,
      purchaseDate: today,
      type: 'MSI',
      months: 3,
    });
    const planId = purchase.installmentPlan.id as string;

    const first = await request(app.getHttpServer())
      .post(`/api/v1/installment-plans/${planId}/prepay`)
      .set(...authHeader(user.accessToken))
      .send({ cashAccountId: account.id, amount: 30000, paymentDate: today })
      .expect(201);

    expect(first.body.settled).toBe(false);
    expect(first.body.allocations).toHaveLength(1);
    expect(first.body.plan.outstandingPrincipal).toBe(60000);
    expect(first.body.plan.installments[0].status).toBe('PAID');
    expect(first.body.plan.installments[1].status).toBe('SCHEDULED');

    const cardAfterFirst = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(cardAfterFirst.body.currentBalance).toBe(60000);

    const payoff = await request(app.getHttpServer())
      .post(`/api/v1/installment-plans/${planId}/prepay`)
      .set(...authHeader(user.accessToken))
      .send({ cashAccountId: account.id, amount: 60000, paymentDate: today })
      .expect(201);

    expect(payoff.body.settled).toBe(true);
    expect(payoff.body.plan.status).toBe('PAID_OFF');
    expect(payoff.body.plan.outstandingPrincipal).toBe(0);

    const purchaseAfter = await request(app.getHttpServer())
      .get(`/api/v1/purchases/${purchase.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(purchaseAfter.body.status).toBe('PAID');

    const accountAfter = await request(app.getHttpServer())
      .get(`/api/v1/cash-accounts/${account.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(accountAfter.body.currentBalance).toBe(410000);

    const again = await request(app.getHttpServer())
      .post(`/api/v1/installment-plans/${planId}/prepay`)
      .set(...authHeader(user.accessToken))
      .send({ cashAccountId: account.id, amount: 1000, paymentDate: today })
      .expect(422);
    expect(again.body.reason).toBe('PLAN_PAID_OFF');

    const reducePayment = await request(app.getHttpServer())
      .post(`/api/v1/installment-plans/${planId}/prepay`)
      .set(...authHeader(user.accessToken))
      .send({ cashAccountId: account.id, amount: 1000, paymentDate: today, mode: 'REDUCE_PAYMENT' })
      .expect(422);
    expect(reducePayment.body.reason).toBe('REDUCE_PAYMENT_NOT_AVAILABLE');
  });

  it('aisla compras y planes entre usuarios', async () => {
    const userA = await createVerifiedUser(app, 'purchase-iso-a');
    const userB = await createVerifiedUser(app, 'purchase-iso-b');
    const cardA = await createCard(app, userA.accessToken, { creditLimit: 3000000 });
    const today = todayInTimeZone('America/Mexico_City');

    const purchase = await createPurchase(userA, {
      creditCardId: cardA.id,
      description: 'Privada',
      amount: 50000,
      purchaseDate: today,
      type: 'MSI',
      months: 3,
    });

    await request(app.getHttpServer())
      .get(`/api/v1/purchases/${purchase.id}`)
      .set(...authHeader(userB.accessToken))
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/v1/installment-plans/${purchase.installmentPlan.id}`)
      .set(...authHeader(userB.accessToken))
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/purchases/${purchase.id}/cancel`)
      .set(...authHeader(userB.accessToken))
      .send({ reason: 'Ajena' })
      .expect(404);
  });

  it('registra una compra MSI ya iniciada al corriente desde su primer corte', async () => {
    const user = await createVerifiedUser(app, 'purchase-msi-ongoing');
    const today = todayInTimeZone('America/Mexico_City');
    const card = await createCard(app, user.accessToken, {
      creditLimit: 3000000,
      cutDay: 15,
      dueDaysAfterCut: 20,
    });
    const startMonth = addMonths(today, -4).slice(0, 7);
    const amount = 600000;

    const purchase = await createPurchase(user, {
      creditCardId: card.id,
      description: 'Telefono ya empezado',
      amount,
      purchaseDate: today,
      type: 'MSI',
      months: 6,
      firstStatementMonth: startMonth,
    });

    const plan = purchase.installmentPlan;
    expect(plan.principal).toBe(amount);
    expect(plan.firstStatementDate).toBe(`${startMonth}-15`);

    const paid = plan.installments.filter((i: { status: string }) => i.status === 'PAID');
    const pending = plan.installments.filter((i: { status: string }) => i.status === 'SCHEDULED');
    expect(paid.length).toBeGreaterThan(0);
    expect(pending.length).toBeGreaterThan(0);
    expect(paid.length + pending.length).toBe(6);

    for (const installment of paid) {
      expect(installment.paidAmount).toBe(installment.totalAmount);
      expect(installment.paidAt).toEqual(expect.any(String));
      expect(installment.statementId).toBeNull();
    }
    for (const installment of pending) {
      expect(installment.paidAmount).toBe(0);
      expect(installment.paidAt).toBeNull();
      expect(compareLocalDates(installment.dueDate, today)).toBeGreaterThan(0);
    }

    const pendingPrincipal = pending.reduce(
      (sum: number, i: { principal: number }) => sum + i.principal,
      0,
    );
    const pendingTotal = pending.reduce(
      (sum: number, i: { totalAmount: number }) => sum + i.totalAmount,
      0,
    );
    expect(plan.outstandingPrincipal).toBe(pendingPrincipal);
    const pendingAverage = Math.round(pendingTotal / pending.length);
    expect(plan.estimatedMonthlyPayment).toBe(pendingAverage);

    // La tarjeta solo carga el principal pendiente.
    const cardAfter = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(cardAfter.body.currentBalance).toBe(pendingPrincipal);
    expect(cardAfter.body.availableCredit).toBe(3000000 - pendingPrincipal);

    // El detalle conserva el monto original y el plan al corriente.
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/purchases/${purchase.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(detail.body.amount).toBe(amount);
    expect(detail.body.installmentPlan.outstandingPrincipal).toBe(pendingPrincipal);

    // La proyeccion solo cuenta las mensualidades vigentes.
    const projection = await request(app.getHttpServer())
      .get('/api/v1/cashflow/projection?days=365')
      .set(...authHeader(user.accessToken))
      .expect(200);
    const obligationEvents = projection.body.points
      .flatMap(
        (point: { events: Array<{ type: string; amount: number }> }) => point.events,
      )
      .filter((event: { type: string }) =>
        ['INSTALLMENT', 'CARD_STATEMENT'].includes(event.type),
      );
    const eventsTotal = obligationEvents.reduce(
      (sum: number, event: { amount: number }) => sum + Math.abs(event.amount),
      0,
    );
    expect(eventsTotal).toBe(pendingTotal);
  });

  it('rechaza un mes de inicio que dejaria el plan liquidado', async () => {
    const user = await createVerifiedUser(app, 'purchase-msi-finished');
    const today = todayInTimeZone('America/Mexico_City');
    const card = await createCard(app, user.accessToken, { cutDay: 15, dueDaysAfterCut: 10 });

    const response = await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .send({
        creditCardId: card.id,
        description: 'Vieja',
        amount: 300000,
        purchaseDate: today,
        type: 'MSI',
        months: 3,
        firstStatementMonth: addMonths(today, -8).slice(0, 7),
      })
      .expect(422);
    expect(response.body.reason).toBe('PLAN_ALREADY_PAID_OFF');
  });

  it('valida el mes de inicio en compras ya iniciadas', async () => {
    const user = await createVerifiedUser(app, 'purchase-start-validation');
    const today = todayInTimeZone('America/Mexico_City');
    const card = await createCard(app, user.accessToken);

    const regular = await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .send({
        creditCardId: card.id,
        description: 'Regular con mes',
        amount: 10000,
        purchaseDate: today,
        type: 'REGULAR',
        firstStatementMonth: addMonths(today, -1).slice(0, 7),
      })
      .expect(400);
    expect(regular.body.reason).toBe('START_MONTH_REQUIRES_PLAN');

    await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .send({
        creditCardId: card.id,
        description: 'Mes invalido',
        amount: 10000,
        purchaseDate: today,
        type: 'MSI',
        months: 6,
        firstStatementMonth: '2026-13',
      })
      .expect(400);
  });

  it('acepta el limite de paginacion como numero en la query', async () => {
    const user = await createVerifiedUser(app, 'purchases-limit');

    const response = await request(app.getHttpServer())
      .get('/api/v1/purchases?limit=20')
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(response.body.meta.limit).toBe(20);
  });
});
