import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { todayInTimeZone } from '../../src/domain/shared/local-date';
import { authHeader, createCashAccount, createVerifiedUser } from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

async function firstExpenseCategoryId(
  app: NestFastifyApplication,
  accessToken: string,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .get('/api/v1/categories?kind=EXPENSE')
    .set(...authHeader(accessToken))
    .expect(200);

  return response.body[0].id as string;
}

describe('Gastos (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('registra un gasto con categoria y descuenta el saldo', async () => {
    const user = await createVerifiedUser(app, 'expense');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 200000 });
    const categoryId = await firstExpenseCategoryId(app, user.accessToken);
    const today = todayInTimeZone('America/Mexico_City');

    const response = await request(app.getHttpServer())
      .post('/api/v1/expenses')
      .set(...authHeader(user.accessToken))
      .send({
        cashAccountId: account.id,
        categoryId,
        description: 'Supermercado',
        amount: 45000,
        expenseDate: today,
      })
      .expect(201);

    expect(response.body.status).toBe('PAID');
    expect(response.body.amount).toBe(45000);

    const accountAfter = await request(app.getHttpServer())
      .get(`/api/v1/cash-accounts/${account.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(accountAfter.body.currentBalance).toBe(155000);

    const list = await request(app.getHttpServer())
      .get('/api/v1/expenses')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].category.name).toEqual(expect.any(String));
  });

  it('rechaza una categoria de ingresos para un gasto', async () => {
    const user = await createVerifiedUser(app, 'expense-kind');
    const account = await createCashAccount(app, user.accessToken);
    const today = todayInTimeZone('America/Mexico_City');

    const incomeCategory = await request(app.getHttpServer())
      .get('/api/v1/categories?kind=INCOME')
      .set(...authHeader(user.accessToken))
      .expect(200);

    const response = await request(app.getHttpServer())
      .post('/api/v1/expenses')
      .set(...authHeader(user.accessToken))
      .send({
        cashAccountId: account.id,
        categoryId: incomeCategory.body[0].id,
        description: 'Categoria incorrecta',
        amount: 1000,
        expenseDate: today,
      })
      .expect(400);

    expect(response.body.reason).toBe('CATEGORY_KIND_MISMATCH');
  });

  it('revierte un gasto y restaura el saldo', async () => {
    const user = await createVerifiedUser(app, 'expense-reverse');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 100000 });
    const today = todayInTimeZone('America/Mexico_City');

    const expense = await request(app.getHttpServer())
      .post('/api/v1/expenses')
      .set(...authHeader(user.accessToken))
      .send({
        cashAccountId: account.id,
        description: 'Compra por error',
        amount: 25000,
        expenseDate: today,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/expenses/${expense.body.id}/reverse`)
      .set(...authHeader(user.accessToken))
      .send({ reason: 'Compra duplicada' })
      .expect(201);

    const accountAfter = await request(app.getHttpServer())
      .get(`/api/v1/cash-accounts/${account.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(accountAfter.body.currentBalance).toBe(100000);

    const expenseAfter = await request(app.getHttpServer())
      .get(`/api/v1/expenses/${expense.body.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(expenseAfter.body.status).toBe('REVERSED');

    const second = await request(app.getHttpServer())
      .post(`/api/v1/expenses/${expense.body.id}/reverse`)
      .set(...authHeader(user.accessToken))
      .send({ reason: 'Otra vez' })
      .expect(409);
    expect(second.body.reason).toBe('EXPENSE_ALREADY_REVERSED');
  });
});
