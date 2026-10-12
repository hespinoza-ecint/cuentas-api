import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { ClockService } from '../../src/infrastructure/clock/clock.module';
import {
  authHeader,
  createCard,
  createCashAccount,
  createVerifiedUser,
  TestUser,
} from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

/**
 * Modelo de cortes: RN-17 (pago para no generar intereses), RN-23 (aplicacion
 * de pagos e anticipos del ciclo abierto), una sola deuda por tarjeta y ciclo
 * proyectado. Usa el reloj sustituible (ClockService) para simular el tiempo.
 */
describe('Modelo de cortes y pagos (integracion)', () => {
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

  async function createPurchase(
    user: TestUser,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .send(body)
      .expect(201);
    return response.body as Record<string, unknown>;
  }

  async function pay(
    user: TestUser,
    cardId: string,
    accountId: string,
    amount: number,
    paymentDate: string,
  ) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/card-payments')
      .set(...authHeader(user.accessToken))
      .send({ creditCardId: cardId, cashAccountId: accountId, amount, paymentDate })
      .expect(201);
    return response.body as {
      payment: { id: string; type: string };
      allocations: Array<{ targetType: string; amount: number }>;
    };
  }

  interface StatementRow {
    id: string;
    cutDate: string;
    paidAmount: number;
    status: string;
    noInterestPaymentCalc: number;
    cycleCharges: number;
  }

  async function listStatements(user: TestUser, cardId: string): Promise<StatementRow[]> {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/cards/${cardId}/statements`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    return response.body as StatementRow[];
  }

  it('RN-17: un pago parcial no marca pagado un corte con mensualidades', async () => {
    travelTo('2026-10-12');
    const user = await createVerifiedUser(app, 'model-partial');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 500000 });
    const card = await createCard(app, user.accessToken, {
      cutDay: 15,
      dueDaysAfterCut: 20,
    });

    await createPurchase(user, {
      creditCardId: card.id,
      description: 'Supermercado',
      amount: 30000,
      purchaseDate: '2026-09-10',
      type: 'REGULAR',
    });
    await createPurchase(user, {
      creditCardId: card.id,
      description: 'Telefono a meses',
      amount: 90000,
      purchaseDate: '2026-09-10',
      type: 'MSI',
      months: 3,
    });

    const before = await listStatements(user, card.id);
    const september = before.find((statement) => statement.cutDate === '2026-09-15');
    expect(september).toBeDefined();
    expect(september?.cycleCharges).toBe(30000);
    expect(september?.noInterestPaymentCalc).toBe(60000);

    // 40000: cubre la mensualidad (30000) y 10000 de los cargos regulares.
    await pay(user, card.id, account.id, 40000, '2026-10-12');

    const after = await listStatements(user, card.id);
    const refreshed = after.find((statement) => statement.cutDate === '2026-09-15');
    expect(refreshed?.paidAmount).toBe(40000);
    expect(refreshed?.noInterestPaymentCalc).toBe(60000);
    expect(refreshed?.status).toBe('OVERDUE');
  });

  it('RN-23: el anticipo del ciclo abierto se abona al corte y la deuda no se cuenta doble', async () => {
    travelTo('2026-09-10');
    const user = await createVerifiedUser(app, 'model-adopt');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 500000 });
    const card = await createCard(app, user.accessToken, {
      cutDay: 15,
      dueDaysAfterCut: 20,
      openingBalance: 100000,
      openingDate: '2026-09-10',
    });

    // Aun no existe ningun corte: el pago queda como revolvente.
    travelTo('2026-09-11');
    const payment = await pay(user, card.id, account.id, 40000, '2026-09-11');
    expect(payment.payment.type).toBe('PARTIAL');
    expect(payment.allocations).toEqual([{ targetType: 'REVOLVING', amount: 40000 }]);

    // Llega el corte de septiembre y despues el de octubre.
    travelTo('2026-10-16');
    const statements = await listStatements(user, card.id);
    const september = statements.find((statement) => statement.cutDate === '2026-09-15');
    const october = statements.find((statement) => statement.cutDate === '2026-10-15');
    expect(september?.paidAmount).toBe(40000);
    expect(october?.noInterestPaymentCalc).toBe(60000);

    // El dashboard muestra la deuda una sola vez (la del corte mas reciente).
    const summary = await request(app.getHttpServer())
      .get('/api/v1/dashboard/summary')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(summary.body.cards.items[0].pendingPayment).toBe(60000);
    expect(summary.body.upcomingPayments.total).toBe(60000);
  });

  it('proyecta el ciclo abierto una sola vez, resta el anticipo y excluye las compras a meses', async () => {
    travelTo('2026-10-12');
    const user = await createVerifiedUser(app, 'model-cycle');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 500000 });
    const card = await createCard(app, user.accessToken, {
      cutDay: 15,
      dueDaysAfterCut: 20,
    });

    await createPurchase(user, {
      creditCardId: card.id,
      description: 'Supermercado',
      amount: 50000,
      purchaseDate: '2026-09-20',
      type: 'REGULAR',
    });
    await createPurchase(user, {
      creditCardId: card.id,
      description: 'Telefono a meses',
      amount: 90000,
      purchaseDate: '2026-09-20',
      type: 'MSI',
      months: 3,
    });
    await pay(user, card.id, account.id, 20000, '2026-09-25');

    const current = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}/statements/current`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(current.body.nextCutDate).toBe('2026-10-15');
    // Solo cargos regulares: la compra a meses se cobra por mensualidad.
    expect(current.body.cycleChargesToDate).toBe(50000);

    const projection = await request(app.getHttpServer())
      .get('/api/v1/cashflow/projection?from=2026-10-12&to=2027-02-01')
      .set(...authHeader(user.accessToken))
      .expect(200);

    const events = projection.body.points.flatMap(
      (point: { date: string; events: Array<{ type: string; amount: number; cardId?: string }> }) =>
        point.events.map((event) => ({ date: point.date, ...event })),
    ) as Array<{ date: string; type: string; amount: number; cardId?: string }>;

    const statementEvents = events.filter(
      (event) => event.type === 'CARD_STATEMENT' && event.cardId === card.id,
    );
    expect(statementEvents).toHaveLength(1);
    // 50000 de cargos + 30000 de la mensualidad del corte - 20000 del anticipo.
    expect(statementEvents[0].amount).toBe(-60000);
    expect(statementEvents[0].date).toBe('2026-11-04');

    const installments = events.filter(
      (event) => event.type === 'INSTALLMENT' && event.cardId === card.id,
    );
    expect(installments.map((event) => event.amount)).toEqual([-30000, -30000]);
  });

  it('con sameDayCutIncluded=false la compra del dia de corte entra al siguiente corte', async () => {
    travelTo('2026-10-16');
    const user = await createVerifiedUser(app, 'model-sameday');
    const card = await createCard(app, user.accessToken, {
      cutDay: 15,
      dueDaysAfterCut: 20,
      sameDayCutIncluded: false,
    });

    await createPurchase(user, {
      creditCardId: card.id,
      description: 'Compra del dia de corte',
      amount: 10000,
      purchaseDate: '2026-09-15',
      type: 'REGULAR',
    });

    const statements = await listStatements(user, card.id);
    const september = statements.find((statement) => statement.cutDate === '2026-09-15');
    const october = statements.find((statement) => statement.cutDate === '2026-10-15');
    expect(september?.noInterestPaymentCalc).toBe(0);
    expect(october?.noInterestPaymentCalc).toBe(10000);
  });

  it('RN-27: al eliminar un plan no cuentan los pagos revertidos', async () => {
    travelTo('2026-10-12');
    const user = await createVerifiedUser(app, 'model-reversed');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 500000 });
    const card = await createCard(app, user.accessToken, { cutDay: 15, dueDaysAfterCut: 20 });

    const purchase = await createPurchase(user, {
      creditCardId: card.id,
      description: 'Telefono por eliminar',
      amount: 90000,
      purchaseDate: '2026-09-10',
      type: 'MSI',
      months: 3,
    });

    // Paga la primera mensualidad y luego revierte el pago.
    const payment = await pay(user, card.id, account.id, 30000, '2026-10-12');
    await request(app.getHttpServer())
      .post(`/api/v1/card-payments/${payment.payment.id}/reverse`)
      .set(...authHeader(user.accessToken))
      .send({ reason: 'Pago duplicado' })
      .expect(201);

    // Sin pagos vigentes, el reverso devuelve el principal completo.
    const removed = await request(app.getHttpServer())
      .delete(`/api/v1/purchases/${(purchase as { id: string }).id}`)
      .set(...authHeader(user.accessToken))
      .send({ reason: 'Registrada por error' })
      .expect(200);
    expect(removed.body.refundedPrincipal).toBe(90000);
    expect(removed.body.paidAmount).toBe(0);
  });

  it('bloquea cambiar el dia de corte cuando ya hay historial', async () => {
    travelTo('2026-10-12');
    const user = await createVerifiedUser(app, 'model-cutday');
    const withHistory = await createCard(app, user.accessToken, {
      cutDay: 15,
      openingBalance: 50000,
      openingDate: '2026-09-10',
    });

    await listStatements(user, withHistory.id);

    const blocked = await request(app.getHttpServer())
      .patch(`/api/v1/cards/${withHistory.id}`)
      .set(...authHeader(user.accessToken))
      .send({ cutDay: 20 })
      .expect(422);
    expect(blocked.body.reason).toBe('CUT_DAY_LOCKED');

    // Otros campos siguen editables.
    const renamed = await request(app.getHttpServer())
      .patch(`/api/v1/cards/${withHistory.id}`)
      .set(...authHeader(user.accessToken))
      .send({ alias: 'Renombrada' })
      .expect(200);
    expect(renamed.body.alias).toBe('Renombrada');

    // Una tarjeta sin cortes ni mensualidades si puede cambiar.
    const clean = await createCard(app, user.accessToken, { cutDay: 15 });
    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/cards/${clean.id}`)
      .set(...authHeader(user.accessToken))
      .send({ cutDay: 20 })
      .expect(200);
    expect(updated.body.cutDay).toBe(20);
  });
});
