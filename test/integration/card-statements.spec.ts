import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { addDays, dayOfWeek, todayInTimeZone } from '../../src/domain/shared/local-date';
import { authHeader, createCard, createVerifiedUser } from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Estados de cuenta de tarjeta (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  function cutDayFrom(date: string): number {
    return Number(date.slice(8, 10));
  }

  it('genera los cortes pasados con fecha limite habil (RN-12 y RN-13)', async () => {
    const user = await createVerifiedUser(app, 'statements');
    const today = todayInTimeZone('America/Mexico_City');
    const openingDate = addDays(today, -40);
    const card = await createCard(app, user.accessToken, {
      openingBalance: 500000,
      openingDate,
      cutDay: cutDayFrom(openingDate),
      dueDaysAfterCut: 20,
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}/statements`)
      .set(...authHeader(user.accessToken))
      .expect(200);

    const statements = response.body as Array<{
      cutDate: string;
      dueDate: string;
      statementBalance: number;
      status: string;
      noInterestPaymentCalc: number;
    }>;

    expect(statements.length).toBeGreaterThanOrEqual(2);

    for (const statement of statements) {
      expect(statement.statementBalance).toBe(500000);
      expect(statement.noInterestPaymentCalc).toBe(500000);
      // RN-13: la fecha limite nunca cae en fin de semana con regla PREVIOUS.
      expect([0, 6]).not.toContain(dayOfWeek(statement.dueDate));
      expect(statement.dueDate >= statement.cutDate).toBe(true);
    }

    const statuses = statements.map((statement) => statement.status);
    expect(statuses).toContain('OVERDUE'); // corte antiguo sin pagar
    expect(statuses).toContain('CLOSED'); // corte reciente aun no vencido
  });

  it('devuelve el ciclo abierto con la proxima fecha de corte', async () => {
    const user = await createVerifiedUser(app, 'statements-current');
    const today = todayInTimeZone('America/Mexico_City');
    const card = await createCard(app, user.accessToken, {
      openingBalance: 300000,
      cutDay: 15,
      dueDaysAfterCut: 20,
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}/statements/current`)
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(response.body.currentBalance).toBe(300000);
    expect(response.body.availableCredit).toBe(1700000);
    expect(response.body.nextCutDate > today).toBe(true);
    expect([0, 6]).not.toContain(dayOfWeek(response.body.projectedDueDate));
  });

  it('permite sobrescribir el pago para no generar intereses (RN-17)', async () => {
    const user = await createVerifiedUser(app, 'statements-reported');
    const today = todayInTimeZone('America/Mexico_City');
    const openingDate = addDays(today, -10);
    const card = await createCard(app, user.accessToken, {
      openingBalance: 400000,
      openingDate,
      cutDay: cutDayFrom(openingDate),
      dueDaysAfterCut: 20,
    });

    const list = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}/statements`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    const statementId = list.body[0].id as string;

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/cards/${card.id}/statements/${statementId}`)
      .set(...authHeader(user.accessToken))
      .send({ noInterestPaymentReported: 380000, minimumPaymentReported: 45000 })
      .expect(200);

    expect(updated.body.noInterestPaymentReported).toBe(380000);
    expect(updated.body.minimumPaymentReported).toBe(45000);
    expect(updated.body.status).toBe('CLOSED');
  });
});
