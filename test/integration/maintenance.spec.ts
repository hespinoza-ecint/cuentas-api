import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { todayInTimeZone } from '../../src/domain/shared/local-date';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { MaintenanceService } from '../../src/modules/maintenance/maintenance.service';
import {
  authHeader,
  createCard,
  createCashAccount,
  createVerifiedUser,
} from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Mantenimiento (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('purga cuentas con datos financieros y sigue con las demas', async () => {
    const user = await createVerifiedUser(app, 'purge-data');
    const clean = await createVerifiedUser(app, 'purge-clean');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 500000 });
    const today = todayInTimeZone('America/Mexico_City');

    await request(app.getHttpServer())
      .post('/api/v1/expenses')
      .set(...authHeader(user.accessToken))
      .send({ cashAccountId: account.id, description: 'Cena', amount: 5000, expenseDate: today })
      .expect(201);

    const card = await createCard(app, user.accessToken, {
      creditLimit: 2000000,
      openingBalance: 100000,
      openingDate: today,
    });
    const purchase = await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .send({
        creditCardId: card.id,
        description: 'Plan por purgar',
        amount: 30000,
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
        amount: 10000,
        paymentDate: today,
      })
      .expect(201);

    expect(purchase.body.installmentPlan).toBeDefined();

    const prisma = app.get(PrismaService);
    const old = new Date(Date.now() - 31 * 86_400_000);
    await prisma.user.updateMany({
      where: { id: { in: [user.userId, clean.userId] } },
      data: { status: 'PENDING_DELETION', deletionRequestedAt: old },
    });

    const report = await app.get(MaintenanceService).run();

    expect(report.usersPurged).toBe(2);
    expect(await prisma.user.findUnique({ where: { id: user.userId } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: clean.userId } })).toBeNull();
  });
});
