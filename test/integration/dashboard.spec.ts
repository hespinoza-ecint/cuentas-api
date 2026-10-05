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

describe('Dashboard (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('resume efectivo, tarjetas, proximos movimientos, gastos y ultima recomendacion', async () => {
    const user = await createVerifiedUser(app, 'dashboard');
    const today = todayInTimeZone('America/Mexico_City');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 1000000 });
    const card = await createCard(app, user.accessToken, {
      creditLimit: 1000000,
      openingBalance: 200000,
      cutDay: Number(today.slice(8, 10)),
    });

    const categories = await request(app.getHttpServer())
      .get('/api/v1/categories?kind=EXPENSE')
      .set(...authHeader(user.accessToken))
      .expect(200);
    const category = categories.body.find(
      (entry: { isSystem: boolean; kind: string }) => entry.isSystem && entry.kind === 'EXPENSE',
    );
    expect(category).toBeDefined();

    await request(app.getHttpServer())
      .post('/api/v1/expenses')
      .set(...authHeader(user.accessToken))
      .send({
        cashAccountId: account.id,
        categoryId: category.id,
        description: 'Supermercado',
        amount: 25000,
        expenseDate: today,
      })
      .expect(201);

    const incomeDate = addDays(today, 5);
    await request(app.getHttpServer())
      .post('/api/v1/income/sources')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Bono',
        cashAccountId: account.id,
        estimatedAmount: 100000,
        schedules: [
          {
            frequency: 'CUSTOM',
            config: { specificDates: [incomeDate] },
            nonBusinessDayRule: 'NONE',
            startDate: today,
          },
        ],
      })
      .expect(201);

    const recommendation = await request(app.getHttpServer())
      .post('/api/v1/recommendations')
      .set(...authHeader(user.accessToken))
      .send({ amount: 10000, purchaseDate: today, type: 'REGULAR' })
      .expect(201);

    const summary = await request(app.getHttpServer())
      .get('/api/v1/dashboard/summary')
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(summary.body.today).toBe(today);
    expect(summary.body.month).toBe(today.slice(0, 7));
    expect(summary.body.cash.spendableBalance).toBe(975000);
    expect(summary.body.cash.totalBalance).toBe(975000);
    expect(summary.body.cash.accountCount).toBe(1);

    expect(summary.body.cards.items).toHaveLength(1);
    const cardItem = summary.body.cards.items[0];
    expect(cardItem.id).toBe(card.id);
    expect(cardItem.utilizationBps).toBe(2000);
    expect(summary.body.cards.totalDebt).toBe(200000);
    expect(summary.body.cards.totalAvailableCredit).toBe(800000);

    expect(summary.body.upcomingIncome.total).toBe(100000);
    expect(summary.body.upcomingIncome.items[0].name).toBe('Bono');
    expect(summary.body.upcomingIncome.items[0].date).toBe(incomeDate);

    expect(summary.body.expenses.spent).toBe(25000);
    expect(summary.body.expenses.previousSpent).toBe(0);
    expect(summary.body.expenses.topCategories[0]).toEqual({
      categoryId: category.id,
      name: category.name,
      amount: 25000,
    });

    expect(summary.body.lastRecommendation.id).toBe(recommendation.body.historyId);
    expect(summary.body.lastRecommendation.outcome).toEqual(expect.any(String));
  });

  it('acepta un mes explicito y valida el formato', async () => {
    const user = await createVerifiedUser(app, 'dashboard-month');

    const summary = await request(app.getHttpServer())
      .get('/api/v1/dashboard/summary?month=2020-01')
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(summary.body.month).toBe('2020-01');
    expect(summary.body.expenses.spent).toBe(0);
    expect(summary.body.expenses.previousMonth).toBe('2019-12');

    await request(app.getHttpServer())
      .get('/api/v1/dashboard/summary?month=2026-13')
      .set(...authHeader(user.accessToken))
      .expect(400);
    await request(app.getHttpServer()).get('/api/v1/dashboard/summary').expect(401);
  });
});
