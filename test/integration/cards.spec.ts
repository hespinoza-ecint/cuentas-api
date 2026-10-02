import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { todayInTimeZone } from '../../src/domain/shared/local-date';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import {
  authHeader,
  createCard,
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

  it('elimina solo tarjetas sin saldo pendiente', async () => {
    const user = await createVerifiedUser(app, 'cards-delete');
    const withBalance = await createCard(app, user.accessToken, { openingBalance: 1000 });
    const empty = await createCard(app, user.accessToken);

    const blocked = await request(app.getHttpServer())
      .delete(`/api/v1/cards/${withBalance.id}`)
      .set(...authHeader(user.accessToken))
      .expect(422);
    expect(blocked.body.reason).toBe('CARD_WITH_BALANCE');

    await request(app.getHttpServer())
      .delete(`/api/v1/cards/${empty.id}`)
      .set(...authHeader(user.accessToken))
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/v1/cards/${empty.id}`)
      .set(...authHeader(user.accessToken))
      .expect(404);
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
});
