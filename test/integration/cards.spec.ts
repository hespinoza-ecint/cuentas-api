import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { todayInTimeZone } from '../../src/domain/shared/local-date';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import {
  authHeader,
  createCard,
  createCashAccount,
  createVerifiedUser,
  loginUser,
  registerUser,
  uniqueEmail,
} from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Tarjetas de credito (integracion)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('crea la tarjeta con saldo inicial, credito disponible y auditoria', async () => {
    const user = await createVerifiedUser(app, 'cards');
    const card = await createCard(app, user.accessToken, { openingBalance: 500000 });

    expect(card.currentBalance).toBe(500000);
    expect(card.availableCredit).toBe(1500000);
    expect(card.status).toBe('ACTIVE');

    const ledger = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}/ledger`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(ledger.body.data).toHaveLength(1);
    expect(ledger.body.data[0].type).toBe('OPENING_BALANCE');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'credit_card.created', entityId: card.id },
    });
    expect(audit).not.toBeNull();
  });

  it('valida datos de la tarjeta', async () => {
    const user = await createVerifiedUser(app, 'cards-validation');

    await request(app.getHttpServer())
      .post('/api/v1/cards')
      .set(...authHeader(user.accessToken))
      .send({ alias: 'Mala', institution: 'Banco', last4: '12', creditLimit: 100000, cutDay: 15 })
      .expect(400);

    const fixedDay = await request(app.getHttpServer())
      .post('/api/v1/cards')
      .set(...authHeader(user.accessToken))
      .send({
        alias: 'Sin dia',
        institution: 'Banco',
        last4: '1234',
        creditLimit: 100000,
        cutDay: 15,
        dueDateMode: 'FIXED_DAY',
      })
      .expect(400);
    expect(fixedDay.body.reason).toBe('DUE_DAY_REQUIRED');

    const alias = `Duplicada ${Date.now()}`;
    await createCard(app, user.accessToken, { alias });
    await request(app.getHttpServer())
      .post('/api/v1/cards')
      .set(...authHeader(user.accessToken))
      .send({
        alias,
        institution: 'Banco',
        last4: '5555',
        creditLimit: 100000,
        cutDay: 20,
        dueDaysAfterCut: 20,
      })
      .expect(409);
  });

  it('no permite bajar el limite por debajo del saldo actual', async () => {
    const user = await createVerifiedUser(app, 'cards-limit');
    const card = await createCard(app, user.accessToken, { openingBalance: 500000 });

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/cards/${card.id}`)
      .set(...authHeader(user.accessToken))
      .send({ creditLimit: 100000 })
      .expect(422);
    expect(response.body.reason).toBe('LIMIT_BELOW_BALANCE');
  });

  it('concilia contra el saldo reportado por el banco', async () => {
    const user = await createVerifiedUser(app, 'cards-reconcile');
    const card = await createCard(app, user.accessToken, { openingBalance: 500000 });
    const today = todayInTimeZone('America/Mexico_City');

    const adjusted = await request(app.getHttpServer())
      .post(`/api/v1/cards/${card.id}/reconcile`)
      .set(...authHeader(user.accessToken))
      .send({ reportedBalance: 520000, asOfDate: today, reason: 'Estado de cuenta del banco' })
      .expect(201);

    expect(adjusted.body.difference).toBe(20000);
    expect(adjusted.body.adjusted).toBe(true);
    expect(adjusted.body.card.currentBalance).toBe(520000);

    const noChange = await request(app.getHttpServer())
      .post(`/api/v1/cards/${card.id}/reconcile`)
      .set(...authHeader(user.accessToken))
      .send({ reportedBalance: 520000, asOfDate: today, reason: 'Sin cambios' })
      .expect(201);
    expect(noChange.body.adjusted).toBe(false);
    expect(noChange.body.difference).toBe(0);
  });

  it('RN-28: reinicia una tarjeta con historial y la deja como nueva', async () => {
    const user = await createVerifiedUser(app, 'cards-reset');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 500000 });
    const card = await createCard(app, user.accessToken, { creditLimit: 3000000 });
    const today = todayInTimeZone('America/Mexico_City');

    // Compra MSI, pago de tarjeta y un recurrente ligado a la tarjeta.
    await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .send({
        creditCardId: card.id,
        description: 'Telefono',
        amount: 300000,
        purchaseDate: today,
        type: 'MSI',
        months: 3,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/card-payments')
      .set(...authHeader(user.accessToken))
      .send({
        creditCardId: card.id,
        cashAccountId: account.id,
        amount: 50000,
        paymentDate: today,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Suscripcion',
        amount: 20000,
        paymentMethod: 'CREDIT_CARD',
        creditCardId: card.id,
        schedule: { frequency: 'MONTHLY', config: { day: 1 }, startDate: today },
      })
      .expect(201);

    const movementsBefore = await request(app.getHttpServer())
      .get('/api/v1/cash-movements')
      .set(...authHeader(user.accessToken))
      .expect(200);

    const reset = await request(app.getHttpServer())
      .post(`/api/v1/cards/${card.id}/reset`)
      .set(...authHeader(user.accessToken))
      .send({ reason: 'Tarjeta de pruebas' })
      .expect(201);

    expect(reset.body.deleted).toMatchObject({
      purchases: 1,
      installmentPlans: 1,
      installments: 3,
      cardPayments: 1,
      recurringExpenses: 0,
    });
    expect(reset.body.deleted.paymentAllocations).toBeGreaterThan(0);
    expect(reset.body.deleted.cardLedgerEntries).toBeGreaterThanOrEqual(2);

    // Queda como nueva: saldo 0 y credito completo.
    const cardAfter = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(cardAfter.body.currentBalance).toBe(0);
    expect(cardAfter.body.availableCredit).toBe(3000000);

    // Dominio vacio, pero la tarjeta, el recurrente y el efectivo siguen.
    const [cardsList, purchases, payments, ledger, statements, recurring, movements] =
      await Promise.all([
        request(app.getHttpServer())
          .get('/api/v1/cards')
          .set(...authHeader(user.accessToken))
          .expect(200),
        request(app.getHttpServer())
          .get('/api/v1/purchases')
          .set(...authHeader(user.accessToken))
          .expect(200),
        request(app.getHttpServer())
          .get('/api/v1/card-payments')
          .set(...authHeader(user.accessToken))
          .expect(200),
        request(app.getHttpServer())
          .get(`/api/v1/cards/${card.id}/ledger`)
          .set(...authHeader(user.accessToken))
          .expect(200),
        request(app.getHttpServer())
          .get(`/api/v1/cards/${card.id}/statements`)
          .set(...authHeader(user.accessToken))
          .expect(200),
        request(app.getHttpServer())
          .get('/api/v1/recurring-expenses')
          .set(...authHeader(user.accessToken))
          .expect(200),
        request(app.getHttpServer())
          .get('/api/v1/cash-movements')
          .set(...authHeader(user.accessToken))
          .expect(200),
      ]);

    expect(cardsList.body).toHaveLength(1);
    expect(purchases.body.data).toHaveLength(0);
    expect(payments.body.data).toHaveLength(0);
    expect(ledger.body.data).toHaveLength(0);
    expect(statements.body).toHaveLength(0);
    const recurringList = (recurring.body.data ?? recurring.body) as Array<{ name: string }>;
    expect(recurringList).toHaveLength(1);
    const movementsList = (movements.body.data ?? movements.body) as unknown[];
    expect(movementsList).toHaveLength(
      (movementsBefore.body.data ?? movementsBefore.body).length,
    );
  });

  it('RN-28: elimina la tarjeta y todo su historial, incluido el recurrente ligado', async () => {
    const user = await createVerifiedUser(app, 'cards-purge');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 500000 });
    const card = await createCard(app, user.accessToken, { creditLimit: 3000000, alias: 'Purga' });
    const other = await createCard(app, user.accessToken, { alias: 'Intacta' });
    const today = todayInTimeZone('America/Mexico_City');

    await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .send({
        creditCardId: card.id,
        description: 'Compra de la purga',
        amount: 100000,
        purchaseDate: today,
        type: 'REGULAR',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Suscripcion tarjeta',
        amount: 20000,
        paymentMethod: 'CREDIT_CARD',
        creditCardId: card.id,
        schedule: { frequency: 'MONTHLY', config: { day: 1 }, startDate: today },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Renta efectivo',
        amount: 100000,
        cashAccountId: account.id,
        schedule: { frequency: 'MONTHLY', config: { day: 1 }, startDate: today },
      })
      .expect(201);

    const removed = await request(app.getHttpServer())
      .delete(`/api/v1/cards/${card.id}`)
      .set(...authHeader(user.accessToken))
      .send({ reason: 'Ya no la uso' })
      .expect(200);

    expect(removed.body.deleted.purchases).toBe(1);
    expect(removed.body.deleted.recurringExpenses).toBe(1);
    expect(removed.body.deleted.cardLedgerEntries).toBeGreaterThanOrEqual(1);

    await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}`)
      .set(...authHeader(user.accessToken))
      .expect(404);

    const cardsList = await request(app.getHttpServer())
      .get('/api/v1/cards')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(cardsList.body.map((item: { id: string }) => item.id)).toEqual([other.id]);

    const recurring = await request(app.getHttpServer())
      .get('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .expect(200);
    const recurringList = (recurring.body.data ?? recurring.body) as Array<{ name: string }>;
    expect(recurringList).toHaveLength(1);
    expect(recurringList[0].name).toBe('Renta efectivo');

    const purchases = await request(app.getHttpServer())
      .get('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(purchases.body.data).toHaveLength(0);

    // El alias queda libre al ser un borrado real.
    await request(app.getHttpServer())
      .post('/api/v1/cards')
      .set(...authHeader(user.accessToken))
      .send({
        alias: 'Purga',
        institution: 'Banco de Pruebas',
        last4: '9999',
        creditLimit: 100000,
        cutDay: 15,
        dueDaysAfterCut: 20,
      })
      .expect(201);
  });

  it('RN-28: aisla reiniciar y eliminar tarjetas entre usuarios', async () => {
    const userA = await createVerifiedUser(app, 'cards-purge-a');
    const userB = await createVerifiedUser(app, 'cards-purge-b');
    const cardA = await createCard(app, userA.accessToken);

    await request(app.getHttpServer())
      .post(`/api/v1/cards/${cardA.id}/reset`)
      .set(...authHeader(userB.accessToken))
      .send({ reason: 'Ajena' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/v1/cards/${cardA.id}`)
      .set(...authHeader(userB.accessToken))
      .send({ reason: 'Ajena' })
      .expect(404);

    // La tarjeta sigue intacta para su dueño.
    await request(app.getHttpServer())
      .get(`/api/v1/cards/${cardA.id}`)
      .set(...authHeader(userA.accessToken))
      .expect(200);
  });

  it('exige correo verificado y aisla las tarjetas entre usuarios', async () => {
    const email = uniqueEmail('cards-unverified');
    await registerUser(app, email);
    const session = await loginUser(app, email);

    const forbidden = await request(app.getHttpServer())
      .post('/api/v1/cards')
      .set(...authHeader(session.accessToken))
      .send({
        alias: 'Sin verificar',
        institution: 'Banco',
        last4: '1234',
        creditLimit: 100000,
        cutDay: 15,
        dueDaysAfterCut: 20,
      })
      .expect(403);
    expect(forbidden.body.reason).toBe('EMAIL_NOT_VERIFIED');

    const userA = await createVerifiedUser(app, 'cards-iso-a');
    const userB = await createVerifiedUser(app, 'cards-iso-b');
    const card = await createCard(app, userA.accessToken, { openingBalance: 1000 });

    await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}`)
      .set(...authHeader(userB.accessToken))
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/cards/${card.id}`)
      .set(...authHeader(userB.accessToken))
      .send({ alias: 'Robada' })
      .expect(404);
  });

  it('acepta el limite del libro como numero en la query', async () => {
    const user = await createVerifiedUser(app, 'cards-ledger-limit');
    const card = await createCard(app, user.accessToken);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}/ledger?limit=20`)
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(response.body.meta.limit).toBe(20);
  });
});
