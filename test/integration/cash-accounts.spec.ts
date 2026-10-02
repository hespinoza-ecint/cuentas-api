import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { todayInTimeZone } from '../../src/domain/shared/local-date';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import {
  authHeader,
  createCashAccount,
  createVerifiedUser,
  loginUser,
  registerUser,
  uniqueEmail,
} from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Cuentas de efectivo (integracion)', () => {
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

  it('crea la cuenta con saldo inicial, movimiento y auditoria', async () => {
    const user = await createVerifiedUser(app, 'accounts');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 150000 });

    expect(account.currentBalance).toBe(150000);
    expect(account.isDefault).toBe(true);

    const movements = await prisma.cashMovement.findMany({
      where: { cashAccountId: account.id },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe('OPENING_BALANCE');
    expect(movements[0].amount).toBe(150000);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'cash_account.created', entityId: account.id },
    });
    expect(audit).not.toBeNull();
  });

  it('solo permite una cuenta predeterminada por usuario', async () => {
    const user = await createVerifiedUser(app, 'defaults');
    const first = await createCashAccount(app, user.accessToken);
    const second = await createCashAccount(app, user.accessToken);

    expect(first.isDefault).toBe(true);
    expect(second.isDefault).toBe(false);

    await request(app.getHttpServer())
      .patch(`/api/v1/cash-accounts/${second.id}`)
      .set(...authHeader(user.accessToken))
      .send({ isDefault: true })
      .expect(200);

    const list = await request(app.getHttpServer())
      .get('/api/v1/cash-accounts')
      .set(...authHeader(user.accessToken))
      .expect(200);

    const defaults = (list.body as Array<{ id: string; isDefault: boolean }>).filter(
      (account) => account.isDefault,
    );
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(second.id);
  });

  it('transfiere entre cuentas con dos movimientos ligados', async () => {
    const user = await createVerifiedUser(app, 'transfer');
    const from = await createCashAccount(app, user.accessToken, { openingBalance: 100000 });
    const to = await createCashAccount(app, user.accessToken);
    const today = todayInTimeZone('America/Mexico_City');

    const response = await request(app.getHttpServer())
      .post('/api/v1/cash-accounts/transfer')
      .set(...authHeader(user.accessToken))
      .send({ fromAccountId: from.id, toAccountId: to.id, amount: 30000, occurredOn: today })
      .expect(201);

    expect(response.body.transferId).toEqual(expect.any(String));

    const [fromAfter, toAfter] = await Promise.all([
      request(app.getHttpServer())
        .get(`/api/v1/cash-accounts/${from.id}`)
        .set(...authHeader(user.accessToken))
        .expect(200),
      request(app.getHttpServer())
        .get(`/api/v1/cash-accounts/${to.id}`)
        .set(...authHeader(user.accessToken))
        .expect(200),
    ]);

    expect(fromAfter.body.currentBalance).toBe(70000);
    expect(toAfter.body.currentBalance).toBe(30000);

    const transfers = await prisma.cashMovement.findMany({
      where: { sourceId: response.body.transferId },
    });
    expect(transfers).toHaveLength(2);
  });

  it('recalcula el saldo desde el libro y corrige desviaciones', async () => {
    const user = await createVerifiedUser(app, 'recalc');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 50000 });

    // Se simula una desviacion de la cache.
    await prisma.cashAccount.update({
      where: { id: account.id },
      data: { currentBalance: 123 },
    });

    const fixed = await request(app.getHttpServer())
      .post(`/api/v1/cash-accounts/${account.id}/recalculate`)
      .set(...authHeader(user.accessToken))
      .expect(201);

    expect(fixed.body).toMatchObject({
      calculatedBalance: 50000,
      corrected: true,
      matches: false,
    });

    const again = await request(app.getHttpServer())
      .post(`/api/v1/cash-accounts/${account.id}/recalculate`)
      .set(...authHeader(user.accessToken))
      .expect(201);
    expect(again.body.matches).toBe(true);
  });

  it('no elimina cuentas con saldo y si las vacias', async () => {
    const user = await createVerifiedUser(app, 'delete-account');
    const withBalance = await createCashAccount(app, user.accessToken, { openingBalance: 1000 });

    const blocked = await request(app.getHttpServer())
      .delete(`/api/v1/cash-accounts/${withBalance.id}`)
      .set(...authHeader(user.accessToken))
      .expect(422);
    expect(blocked.body.reason).toBe('ACCOUNT_WITH_BALANCE');

    const empty = await createCashAccount(app, user.accessToken);
    await request(app.getHttpServer())
      .delete(`/api/v1/cash-accounts/${empty.id}`)
      .set(...authHeader(user.accessToken))
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/v1/cash-accounts/${empty.id}`)
      .set(...authHeader(user.accessToken))
      .expect(404);
  });

  it('exige correo verificado para operar y aisla los datos entre usuarios', async () => {
    const email = uniqueEmail('unverified');
    await registerUser(app, email);
    const session = await loginUser(app, email);

    const forbidden = await request(app.getHttpServer())
      .post('/api/v1/cash-accounts')
      .set(...authHeader(session.accessToken))
      .send({ name: 'Cuenta sin verificar' })
      .expect(403);
    expect(forbidden.body.reason).toBe('EMAIL_NOT_VERIFIED');

    const userA = await createVerifiedUser(app, 'iso-a');
    const userB = await createVerifiedUser(app, 'iso-b');
    const account = await createCashAccount(app, userA.accessToken);

    await request(app.getHttpServer())
      .get(`/api/v1/cash-accounts/${account.id}`)
      .set(...authHeader(userB.accessToken))
      .expect(404);
  });
});
