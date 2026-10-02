import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { todayInTimeZone } from '../../src/domain/shared/local-date';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import {
  authHeader,
  createCard,
  createCashAccount,
  createVerifiedUser,
} from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Motor de recomendaciones (integracion)', () => {
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

  it('recomienda la tarjeta, explica y guarda el historial', async () => {
    const user = await createVerifiedUser(app, 'rec-basic');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 2000000 });
    const card = await createCard(app, user.accessToken, { creditLimit: 3000000 });
    const today = todayInTimeZone('America/Mexico_City');

    const response = await request(app.getHttpServer())
      .post('/api/v1/recommendations')
      .set(...authHeader(user.accessToken))
      .send({ amount: 200000, purchaseDate: today, type: 'REGULAR' })
      .expect(201);

    expect(response.body.outcome).toBe('CARD');
    expect(response.body.recommended.cardId).toBe(card.id);
    expect(response.body.recommended.dueDate).toEqual(expect.any(String));
    expect(response.body.recommended.reasons.length).toBeGreaterThan(0);
    expect(response.body.disclaimer).toContain('no constituye asesoria financiera');
    expect(response.body.historyId).toEqual(expect.any(String));
    expect(response.body.alternatives.length).toBeGreaterThan(0);

    // El saldo del efectivo no se modifica al recomendar.
    const accountAfter = await request(app.getHttpServer())
      .get(`/api/v1/cash-accounts/${account.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(accountAfter.body.currentBalance).toBe(2000000);

    const history = await request(app.getHttpServer())
      .get('/api/v1/recommendations')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0].outcome).toBe('CARD');

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/recommendations/${response.body.historyId}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(detail.body.result.outcome).toBe('CARD');
    expect(Array.isArray(detail.body.rulesSnapshot)).toBe(true);

    // Se puede ligar la compra real con la recomendacion.
    await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .send({
        creditCardId: card.id,
        description: 'Compra recomendada',
        amount: 200000,
        purchaseDate: today,
        type: 'REGULAR',
        recommendationId: response.body.historyId,
      })
      .expect(201);

    const purchase = await prisma.purchase.findFirst({
      where: { userId: user.userId, recommendationId: response.body.historyId },
    });
    expect(purchase).not.toBeNull();
  });

  it('responde NONE con sugerencias cuando nada pasa las reglas', async () => {
    const user = await createVerifiedUser(app, 'rec-none');
    await createCashAccount(app, user.accessToken);
    await createCard(app, user.accessToken, { creditLimit: 50000 });
    const today = todayInTimeZone('America/Mexico_City');

    const response = await request(app.getHttpServer())
      .post('/api/v1/recommendations')
      .set(...authHeader(user.accessToken))
      .send({ amount: 500000, purchaseDate: today, type: 'REGULAR' })
      .expect(201);

    expect(response.body.outcome).toBe('NONE');
    expect(response.body.recommended).toBeUndefined();
    expect(response.body.suggestions.length).toBeGreaterThan(0);

    const cardOption = response.body.alternatives.find(
      (option: { kind: string }) => option.kind === 'CARD',
    );
    expect(
      cardOption.eliminatedBy.some(
        (finding: { code: string }) => finding.code === 'CREDIT_AVAILABLE',
      ),
    ).toBe(true);
  });

  it('lista reglas y permite sobrescribirlas por usuario', async () => {
    const user = await createVerifiedUser(app, 'rec-rules');

    const initial = await request(app.getHttpServer())
      .get('/api/v1/recommendation-rules')
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(initial.body).toHaveLength(8);
    const cashflowRule = initial.body.find(
      (rule: { code: string }) => rule.code === 'CASHFLOW_NON_NEGATIVE',
    );
    expect(cashflowRule.isOverridden).toBe(false);
    expect(cashflowRule.isEnabled).toBe(true);

    const overridden = await request(app.getHttpServer())
      .put('/api/v1/recommendation-rules/CASHFLOW_NON_NEGATIVE/override')
      .set(...authHeader(user.accessToken))
      .send({ isEnabled: false })
      .expect(200);
    const updated = overridden.body.find(
      (rule: { code: string }) => rule.code === 'CASHFLOW_NON_NEGATIVE',
    );
    expect(updated.isEnabled).toBe(false);
    expect(updated.isOverridden).toBe(true);

    await request(app.getHttpServer())
      .delete('/api/v1/recommendation-rules/CASHFLOW_NON_NEGATIVE/override')
      .set(...authHeader(user.accessToken))
      .expect(204);

    const restored = await request(app.getHttpServer())
      .get('/api/v1/recommendation-rules')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(
      restored.body.find((rule: { code: string }) => rule.code === 'CASHFLOW_NON_NEGATIVE')
        .isOverridden,
    ).toBe(false);

    await request(app.getHttpServer())
      .put('/api/v1/recommendation-rules/NO_EXISTE/override')
      .set(...authHeader(user.accessToken))
      .send({ isEnabled: false })
      .expect(404);
  });

  it('solo el admin puede ajustar las reglas globales', async () => {
    const user = await createVerifiedUser(app, 'rec-admin');

    await request(app.getHttpServer())
      .patch('/api/v1/admin/recommendation-rules/NO_INTEREST')
      .set(...authHeader(user.accessToken))
      .send({ weight: 40 })
      .expect(403);

    await prisma.user.update({ where: { id: user.userId }, data: { role: 'ADMIN' } });

    const updated = await request(app.getHttpServer())
      .patch('/api/v1/admin/recommendation-rules/NO_INTEREST')
      .set(...authHeader(user.accessToken))
      .send({ weight: 40 })
      .expect(200);
    expect(updated.body.weight).toBe(40);

    const invalid = await request(app.getHttpServer())
      .patch('/api/v1/admin/recommendation-rules/CARD_ACTIVE')
      .set(...authHeader(user.accessToken))
      .send({ weight: 10 })
      .expect(400);
    expect(invalid.body.reason).toBe('ELIMINATORY_RULE_WITH_WEIGHT');

    // Restaurar el valor por defecto para no afectar a otras pruebas.
    await request(app.getHttpServer())
      .patch('/api/v1/admin/recommendation-rules/NO_INTEREST')
      .set(...authHeader(user.accessToken))
      .send({ weight: 35 })
      .expect(200);
  });

  it('RN-24: la anualidad se proyecta como obligacion futura', async () => {
    const user = await createVerifiedUser(app, 'rec-annual-fee');
    await createCashAccount(app, user.accessToken, { openingBalance: 1000000 });
    const today = todayInTimeZone('America/Mexico_City');
    const currentMonth = Number(today.slice(5, 7));
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    await createCard(app, user.accessToken, {
      creditLimit: 2000000,
      annualFee: 15000,
      annualFeeMonth: nextMonth,
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/recommendations')
      .set(...authHeader(user.accessToken))
      .send({ amount: 100000, purchaseDate: today, type: 'REGULAR' })
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/recommendations/${response.body.historyId}`)
      .set(...authHeader(user.accessToken))
      .expect(200);

    const obligations = detail.body.contextSnapshot.cardObligations as Array<{
      description: string;
    }>;
    expect(obligations.some((entry) => entry.description.startsWith('Anualidad'))).toBe(true);
  });
});
