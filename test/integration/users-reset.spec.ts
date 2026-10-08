import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { todayInTimeZone } from '../../src/domain/shared/local-date';
import {
  authHeader,
  createCard,
  createCashAccount,
  createVerifiedUser,
  TEST_PASSWORD,
} from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Restablecimiento de datos financieros (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function list(token: string, path: string): Promise<Array<Record<string, unknown>>> {
    const response = await request(app.getHttpServer())
      .get(path)
      .set(...authHeader(token))
      .expect(200);
    return Array.isArray(response.body) ? response.body : response.body.data;
  }

  it('exige la contrasena y borra los datos conservando cuenta, sesion y preferencias', async () => {
    const user = await createVerifiedUser(app, 'reset');
    const other = await createVerifiedUser(app, 'reset-otro');
    const today = todayInTimeZone('America/Mexico_City');

    // Datos del usuario: cuenta con apertura, categoria propia, recurrente,
    // fuente de ingreso con calendario, tarjeta y compra MSI.
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 500000 });
    const card = await createCard(app, user.accessToken, { creditLimit: 2000000 });

    await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(...authHeader(user.accessToken))
      .send({ name: 'Categoria propia', kind: 'EXPENSE' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Renta',
        amount: 100000,
        cashAccountId: account.id,
        schedule: { frequency: 'MONTHLY', config: { day: 1 }, startDate: today },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/income/sources')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Sueldo',
        cashAccountId: account.id,
        estimatedAmount: 1000000,
        schedules: [
          {
            frequency: 'MONTHLY',
            config: { day: 15 },
            nonBusinessDayRule: 'NONE',
            startDate: today,
          },
        ],
      })
      .expect(201);

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
      .patch('/api/v1/users/me/settings')
      .set(...authHeader(user.accessToken))
      .send({ timezone: 'America/Tijuana', minCashBuffer: 150000 })
      .expect(200);

    // Datos del otro usuario que no deben tocarse.
    const otherAccount = await createCashAccount(app, other.accessToken, {
      openingBalance: 900000,
    });
    await createCard(app, other.accessToken);

    // Contrasena incorrecta: no borra nada.
    const wrong = await request(app.getHttpServer())
      .post('/api/v1/users/me/reset')
      .set(...authHeader(user.accessToken))
      .send({ password: 'Incorrecta123' })
      .expect(400);
    expect(wrong.body.reason).toBe('INVALID_PASSWORD');
    expect(await list(user.accessToken, '/api/v1/cash-accounts')).toHaveLength(1);

    // Reset correcto.
    const reset = await request(app.getHttpServer())
      .post('/api/v1/users/me/reset')
      .set(...authHeader(user.accessToken))
      .send({ password: TEST_PASSWORD })
      .expect(200);
    expect(reset.body.scope).toBe('ALL');
    expect(reset.body.message).toEqual(expect.any(String));
    expect(reset.body.deleted).toMatchObject({
      cashAccounts: 1,
      cashMovements: 1,
      creditCards: 1,
      purchases: 1,
      installmentPlans: 1,
      installments: 3,
      recurringExpenses: 1,
      incomeSources: 1,
      incomeSchedules: 1,
      categories: 1,
    });
    expect(reset.body.deleted.auditLogs).toBeGreaterThan(0);

    // Listados financieros vacios.
    expect(await list(user.accessToken, '/api/v1/cash-accounts')).toHaveLength(0);
    expect(await list(user.accessToken, '/api/v1/cash-movements')).toHaveLength(0);
    expect(await list(user.accessToken, '/api/v1/expenses')).toHaveLength(0);
    expect(await list(user.accessToken, '/api/v1/recurring-expenses')).toHaveLength(0);
    expect(await list(user.accessToken, '/api/v1/income/sources')).toHaveLength(0);
    expect(await list(user.accessToken, '/api/v1/cards')).toHaveLength(0);
    expect(await list(user.accessToken, '/api/v1/purchases')).toHaveLength(0);

    // La categoria propia desaparece; las del sistema siguen disponibles.
    const categories = await list(user.accessToken, '/api/v1/categories');
    expect(categories.length).toBeGreaterThan(0);
    expect(categories.every((item) => item.userId !== user.userId)).toBe(true);

    // Cuenta, sesion y preferencias intactas.
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set(...authHeader(user.accessToken))
      .expect(200);
    const settings = await request(app.getHttpServer())
      .get('/api/v1/users/me/settings')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(settings.body.timezone).toBe('America/Tijuana');
    expect(settings.body.minCashBuffer).toBe(150000);

    // El otro usuario conserva todo.
    const otherAccounts = await list(other.accessToken, '/api/v1/cash-accounts');
    expect(otherAccounts).toHaveLength(1);
    expect(otherAccounts[0].id).toBe(otherAccount.id);
    expect(await list(other.accessToken, '/api/v1/cards')).toHaveLength(1);

    // Puede empezar de cero.
    await createCashAccount(app, user.accessToken, { openingBalance: 10000 });
    expect(await list(user.accessToken, '/api/v1/cash-accounts')).toHaveLength(1);
  });

  it('restablece solo las tarjetas y conserva efectivo, ingresos, gastos y recurrentes', async () => {
    const user = await createVerifiedUser(app, 'reset-cards');
    const today = todayInTimeZone('America/Mexico_City');

    const account = await createCashAccount(app, user.accessToken, { openingBalance: 500000 });
    const card = await createCard(app, user.accessToken, { creditLimit: 2000000 });

    // Gasto de efectivo, recurrente e ingreso: no deben tocarse.
    await request(app.getHttpServer())
      .post('/api/v1/expenses')
      .set(...authHeader(user.accessToken))
      .send({
        cashAccountId: account.id,
        description: 'Supermercado',
        amount: 25000,
        expenseDate: today,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Renta',
        amount: 100000,
        cashAccountId: account.id,
        schedule: { frequency: 'MONTHLY', config: { day: 1 }, startDate: today },
      })
      .expect(201);
    // Recurrente ligado a la tarjeta: no puede sobrevivir al reset de tarjetas.
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
      .post('/api/v1/income/sources')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Sueldo',
        cashAccountId: account.id,
        estimatedAmount: 1000000,
        schedules: [
          {
            frequency: 'MONTHLY',
            config: { day: 15 },
            nonBusinessDayRule: 'NONE',
            startDate: today,
          },
        ],
      })
      .expect(201);

    // Compra MSI y pago de tarjeta (genera movimiento de efectivo).
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

    const movementsBefore = await list(user.accessToken, '/api/v1/cash-movements');

    const reset = await request(app.getHttpServer())
      .post('/api/v1/users/me/reset')
      .set(...authHeader(user.accessToken))
      .send({ password: TEST_PASSWORD, scope: 'CARDS' })
      .expect(200);

    expect(reset.body.scope).toBe('CARDS');
    expect(reset.body.deleted).toMatchObject({
      creditCards: 1,
      purchases: 1,
      installmentPlans: 1,
      installments: 3,
      cardPayments: 1,
      recurringExpenses: 1,
    });
    expect(reset.body.deleted.paymentAllocations).toBeGreaterThan(0);
    expect(reset.body.deleted.cardLedgerEntries).toBeGreaterThanOrEqual(2);

    // El dominio de tarjetas queda vacio.
    expect(await list(user.accessToken, '/api/v1/cards')).toHaveLength(0);
    expect(await list(user.accessToken, '/api/v1/purchases')).toHaveLength(0);
    expect(await list(user.accessToken, '/api/v1/card-payments')).toHaveLength(0);

    // Efectivo, ingresos y recurrentes de efectivo intactos, incluido el
    // movimiento del pago; el recurrente ligado a la tarjeta se fue con ella.
    expect(await list(user.accessToken, '/api/v1/cash-accounts')).toHaveLength(1);
    expect(await list(user.accessToken, '/api/v1/expenses')).toHaveLength(1);
    const recurringLeft = await list(user.accessToken, '/api/v1/recurring-expenses');
    expect(recurringLeft).toHaveLength(1);
    expect(recurringLeft[0].name).toBe('Renta');
    expect(await list(user.accessToken, '/api/v1/income/sources')).toHaveLength(1);

    const movementsAfter = await list(user.accessToken, '/api/v1/cash-movements');
    expect(movementsAfter).toHaveLength(movementsBefore.length);

    const accountAfter = await request(app.getHttpServer())
      .get(`/api/v1/cash-accounts/${account.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(accountAfter.body.currentBalance).toBe(500000 - 25000 - 50000);

    // Y puede registrar tarjetas de nuevo.
    await createCard(app, user.accessToken, { creditLimit: 1000000 });
    expect(await list(user.accessToken, '/api/v1/cards')).toHaveLength(1);
  });

  it('deja los conteos en cero cuando el usuario no tiene datos', async () => {
    const user = await createVerifiedUser(app, 'reset-vacio');

    const reset = await request(app.getHttpServer())
      .post('/api/v1/users/me/reset')
      .set(...authHeader(user.accessToken))
      .send({ password: TEST_PASSWORD })
      .expect(200);

    expect(reset.body.deleted.cashAccounts).toBe(0);
    expect(reset.body.deleted.creditCards).toBe(0);
    expect(reset.body.deleted.categories).toBe(0);
  });
});
