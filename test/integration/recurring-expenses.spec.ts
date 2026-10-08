import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  addDays,
  compareLocalDates,
  dayOfWeek,
  todayInTimeZone,
} from '../../src/domain/shared/local-date';
import { authHeader, createCard, createCashAccount, createVerifiedUser } from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Gastos recurrentes (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  function nextSaturday(from: string): string {
    let cursor = addDays(from, 7);
    while (dayOfWeek(cursor) !== 6) {
      cursor = addDays(cursor, 1);
    }
    return cursor;
  }

  it('calcula la proxima ocurrencia ajustando el fin de semana', async () => {
    const user = await createVerifiedUser(app, 'recurring');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 300000 });
    const today = todayInTimeZone('America/Mexico_City');
    const saturday = nextSaturday(today);

    const created = await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Renta',
        amount: 120000,
        cashAccountId: account.id,
        schedule: {
          frequency: 'CUSTOM',
          config: { specificDates: [saturday] },
          nonBusinessDayRule: 'PREVIOUS',
          startDate: today,
        },
      })
      .expect(201);

    const upcoming = await request(app.getHttpServer())
      .get('/api/v1/recurring-expenses/upcoming?days=120')
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(upcoming.body.occurrences).toHaveLength(1);
    const occurrence = upcoming.body.occurrences[0];
    expect(occurrence.recurringExpenseId).toBe(created.body.id);
    expect(occurrence.expectedDate).not.toBe(saturday);
    expect(compareLocalDates(occurrence.expectedDate, saturday)).toBeLessThan(0);
    expect([0, 6]).not.toContain(dayOfWeek(occurrence.expectedDate));
  });

  it('confirma una ocurrencia generando el gasto y su movimiento', async () => {
    const user = await createVerifiedUser(app, 'recurring-confirm');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 100000 });
    const today = todayInTimeZone('America/Mexico_City');

    const created = await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Internet',
        amount: 80000,
        cashAccountId: account.id,
        schedule: {
          frequency: 'CUSTOM',
          config: { specificDates: [today] },
          nonBusinessDayRule: 'NONE',
          startDate: today,
        },
      })
      .expect(201);

    const confirmation = await request(app.getHttpServer())
      .post(`/api/v1/recurring-expenses/${created.body.id}/confirm`)
      .set(...authHeader(user.accessToken))
      .send({ occurrenceDate: today })
      .expect(201);

    expect(confirmation.body.expenseId).toEqual(expect.any(String));

    const accountAfter = await request(app.getHttpServer())
      .get(`/api/v1/cash-accounts/${account.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(accountAfter.body.currentBalance).toBe(20000);

    const upcoming = await request(app.getHttpServer())
      .get('/api/v1/recurring-expenses/upcoming?days=60')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(upcoming.body.occurrences).toHaveLength(0);

    const duplicate = await request(app.getHttpServer())
      .post(`/api/v1/recurring-expenses/${created.body.id}/confirm`)
      .set(...authHeader(user.accessToken))
      .send({ occurrenceDate: today })
      .expect(409);
    expect(duplicate.body.reason).toBe('OCCURRENCE_ALREADY_CONFIRMED');
  });

  it('desactiva y elimina logicamente un gasto recurrente', async () => {
    const user = await createVerifiedUser(app, 'recurring-delete');
    const account = await createCashAccount(app, user.accessToken);

    const created = await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Suscripcion',
        amount: 20000,
        cashAccountId: account.id,
        schedule: { frequency: 'MONTHLY', config: { day: 15 }, startDate: '2026-01-01' },
      })
      .expect(201);

    // Desactivado: no aparece en la lista activa, si con includeInactive.
    await request(app.getHttpServer())
      .patch(`/api/v1/recurring-expenses/${created.body.id}`)
      .set(...authHeader(user.accessToken))
      .send({ isActive: false })
      .expect(200);

    const active = await request(app.getHttpServer())
      .get('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(active.body).toHaveLength(0);

    const includeInactive = await request(app.getHttpServer())
      .get('/api/v1/recurring-expenses?includeInactive=true')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(includeInactive.body).toHaveLength(1);
    expect(includeInactive.body[0].isActive).toBe(false);

    // Eliminado (borrado logico): desaparece incluso con includeInactive.
    await request(app.getHttpServer())
      .delete(`/api/v1/recurring-expenses/${created.body.id}`)
      .set(...authHeader(user.accessToken))
      .expect(204);

    const afterDelete = await request(app.getHttpServer())
      .get('/api/v1/recurring-expenses?includeInactive=true')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(afterDelete.body).toHaveLength(0);
  });

  it('crea un recurrente pagado con tarjeta y confirma generando la compra', async () => {
    const user = await createVerifiedUser(app, 'recurring-card');
    const card = await createCard(app, user.accessToken);
    const today = todayInTimeZone('America/Mexico_City');

    const created = await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Streaming',
        amount: 30000,
        paymentMethod: 'CREDIT_CARD',
        creditCardId: card.id,
        schedule: {
          frequency: 'CUSTOM',
          config: { specificDates: [today] },
          nonBusinessDayRule: 'NONE',
          startDate: today,
        },
      })
      .expect(201);

    expect(created.body.paymentMethod).toBe('CREDIT_CARD');
    expect(created.body.creditCardId).toBe(card.id);
    expect(created.body.cashAccountId).toBeNull();

    const confirmation = await request(app.getHttpServer())
      .post(`/api/v1/recurring-expenses/${created.body.id}/confirm`)
      .set(...authHeader(user.accessToken))
      .send({ occurrenceDate: today })
      .expect(201);

    expect(confirmation.body.purchaseId).toEqual(expect.any(String));
    expect(confirmation.body.expenseId).toBeUndefined();

    // La compra queda ligada al recurrente y carga la deuda de la tarjeta.
    const purchases = await request(app.getHttpServer())
      .get('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(purchases.body.data).toHaveLength(1);
    expect(purchases.body.data[0]).toMatchObject({
      id: confirmation.body.purchaseId,
      recurringExpenseId: created.body.id,
      type: 'REGULAR',
      amount: 30000,
    });

    const cardAfter = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(cardAfter.body.currentBalance).toBe(30000);

    // No se crea gasto de efectivo ni queda la ocurrencia pendiente.
    const expenses = await request(app.getHttpServer())
      .get('/api/v1/expenses')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(expenses.body.data).toHaveLength(0);

    const upcoming = await request(app.getHttpServer())
      .get('/api/v1/recurring-expenses/upcoming?days=60')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(upcoming.body.occurrences).toHaveLength(0);

    const duplicate = await request(app.getHttpServer())
      .post(`/api/v1/recurring-expenses/${created.body.id}/confirm`)
      .set(...authHeader(user.accessToken))
      .send({ occurrenceDate: today })
      .expect(409);
    expect(duplicate.body.reason).toBe('OCCURRENCE_ALREADY_CONFIRMED');
  });

  it('lista ocurrencias vencidas y al confirmarlas caen en el corte que les toca', async () => {
    const user = await createVerifiedUser(app, 'recurring-overdue');
    const today = todayInTimeZone('America/Mexico_City');
    const openingDate = addDays(today, -40);
    const card = await createCard(app, user.accessToken, {
      creditLimit: 3000000,
      cutDay: Number(openingDate.slice(8, 10)),
      dueDaysAfterCut: 10,
    });
    const occurrenceDate = addDays(today, -38);

    const created = await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Suscripcion vencida',
        amount: 30000,
        paymentMethod: 'CREDIT_CARD',
        creditCardId: card.id,
        schedule: {
          frequency: 'CUSTOM',
          config: { specificDates: [occurrenceDate] },
          nonBusinessDayRule: 'NONE',
          startDate: occurrenceDate,
        },
      })
      .expect(201);

    // La ocurrencia vencida se lista para poder confirmarla.
    const upcomingOverdue = await request(app.getHttpServer())
      .get('/api/v1/recurring-expenses/upcoming?days=60')
      .set(...authHeader(user.accessToken))
      .expect(200);
    const overdue = upcomingOverdue.body.occurrences.find(
      (occurrence: { expectedDate: string }) => occurrence.expectedDate === occurrenceDate,
    );
    expect(overdue).toBeDefined();
    expect(overdue.daysUntil).toBeLessThan(0);

    // Confirmarla sin fecha real la registra en su fecha original.
    const confirmation = await request(app.getHttpServer())
      .post(`/api/v1/recurring-expenses/${created.body.id}/confirm`)
      .set(...authHeader(user.accessToken))
      .send({ occurrenceDate })
      .expect(201);
    expect(confirmation.body.purchaseId).toEqual(expect.any(String));

    const purchases = await request(app.getHttpServer())
      .get('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(purchases.body.data).toHaveLength(1);
    expect(purchases.body.data[0].purchaseDate).toBe(occurrenceDate);

    // El corte ya cerrado incluye el cargo: no se va a un corte futuro.
    const statements = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}/statements`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(statements.body).toHaveLength(1);
    expect(statements.body[0].noInterestPaymentCalc).toBe(30000);
    expect(statements.body[0].cycleCharges).toBe(30000);

    // Y ya no queda pendiente por confirmar.
    const upcomingAfter = await request(app.getHttpServer())
      .get('/api/v1/recurring-expenses/upcoming?days=60')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(upcomingAfter.body.occurrences).toHaveLength(0);
  });

  it('valida el metodo de pago, la tarjeta y permite cambiar de efectivo a tarjeta', async () => {
    const user = await createVerifiedUser(app, 'recurring-card-validation');
    const account = await createCashAccount(app, user.accessToken);
    const today = todayInTimeZone('America/Mexico_City');
    const schedule = { frequency: 'CUSTOM', config: { specificDates: [today] }, startDate: today };

    const missing = await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({ name: 'Sin destino', amount: 1000, schedule })
      .expect(400);
    expect(missing.body.reason).toBe('PAYMENT_METHOD_REQUIRED');

    const noCard = await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({ name: 'Sin tarjeta', amount: 1000, paymentMethod: 'CREDIT_CARD', schedule })
      .expect(400);
    expect(noCard.body.reason).toBe('CREDIT_CARD_REQUIRED');

    const unknownCard = await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({
        name: 'Tarjeta inexistente',
        amount: 1000,
        paymentMethod: 'CREDIT_CARD',
        creditCardId: randomUUID(),
        schedule,
      })
      .expect(404);
    expect(unknownCard.body.reason).toBe('CARD_NOT_FOUND');

    // Cambiar de efectivo a tarjeta: la confirmacion ya no toca la cuenta.
    const created = await request(app.getHttpServer())
      .post('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .send({ name: 'Cambia a tarjeta', amount: 15000, cashAccountId: account.id, schedule })
      .expect(201);
    expect(created.body.paymentMethod).toBe('CASH_ACCOUNT');

    const card = await createCard(app, user.accessToken);
    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/recurring-expenses/${created.body.id}`)
      .set(...authHeader(user.accessToken))
      .send({ paymentMethod: 'CREDIT_CARD', creditCardId: card.id })
      .expect(200);
    expect(updated.body.paymentMethod).toBe('CREDIT_CARD');
    expect(updated.body.creditCardId).toBe(card.id);

    const confirmation = await request(app.getHttpServer())
      .post(`/api/v1/recurring-expenses/${created.body.id}/confirm`)
      .set(...authHeader(user.accessToken))
      .send({ occurrenceDate: today })
      .expect(201);
    expect(confirmation.body.purchaseId).toEqual(expect.any(String));

    const accountAfter = await request(app.getHttpServer())
      .get(`/api/v1/cash-accounts/${account.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(accountAfter.body.currentBalance).toBe(0);

    // La lista incluye la tarjeta para mostrarla en la UI.
    const list = await request(app.getHttpServer())
      .get('/api/v1/recurring-expenses')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(list.body[0].creditCard).toMatchObject({ id: card.id, alias: card.alias });
    expect(list.body[0].cashAccount).toMatchObject({ id: account.id });
  });
});
