import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { ClockService } from '../../src/infrastructure/clock/clock.module';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import {
  authHeader,
  createCard,
  createCashAccount,
  createVerifiedUser,
  TestUser,
} from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Importacion de compras desde Excel (RN-31)', () => {
  let app: NestFastifyApplication;
  let clock: ClockService;
  let prisma: PrismaService;
  let realNow: () => Date;

  beforeAll(async () => {
    app = await createTestApp();
    clock = app.get(ClockService);
    prisma = app.get(PrismaService);
    realNow = clock.now.bind(clock);
  });

  afterEach(() => {
    clock.now = realNow;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  /** Simula la fecha actual (18:00Z = 12:00 en America/Mexico_City). */
  function travelTo(date: string): void {
    clock.now = () => new Date(`${date}T18:00:00Z`);
  }

  function preview(user: TestUser, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/v1/purchases/import/preview')
      .set(...authHeader(user.accessToken))
      .send(body);
  }

  async function createPurchase(user: TestUser, body: Record<string, unknown>) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .send(body)
      .expect(201);
    return response.body;
  }

  it('marca duplicados por cantidad, ignorando mayusculas y espacios', async () => {
    const user = await createVerifiedUser(app, 'import-dup');
    travelTo('2026-10-20');
    const card = await createCard(app, user.accessToken, { cutDay: 15 });
    const existing = await createPurchase(user, {
      creditCardId: card.id,
      description: '  UBER   Trip ',
      amount: 8997,
      purchaseDate: '2026-10-04',
      type: 'REGULAR',
    });

    const response = await preview(user, {
      creditCardId: card.id,
      rows: [
        { purchaseDate: '2026-10-04', description: 'uber trip', amount: 8997 },
        { purchaseDate: '2026-10-04', description: 'UBER TRIP', amount: 8997 },
        { purchaseDate: '2026-10-05', description: 'Oxxo', amount: 4450 },
      ],
    }).expect(200);

    expect(response.body.data).toEqual([
      { index: 0, duplicateOfId: existing.id, statementPaid: false, dateIssue: null },
      { index: 1, duplicateOfId: null, statementPaid: false, dateIssue: null },
      { index: 2, duplicateOfId: null, statementPaid: false, dateIssue: null },
    ]);
  });

  it('marca corte pagado y distingue el ciclo abierto', async () => {
    const user = await createVerifiedUser(app, 'import-paid');
    travelTo('2026-10-20');
    const card = await createCard(app, user.accessToken, {
      creditLimit: 3000000,
      cutDay: 15,
      dueDaysAfterCut: 20,
    });
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 500000 });

    // Compra del corte del 15 de octubre (ya cerrado) y su pago (patron RN-30).
    await createPurchase(user, {
      creditCardId: card.id,
      description: 'Regular ya pagada',
      amount: 10000,
      purchaseDate: '2026-10-10',
      type: 'REGULAR',
    });
    await request(app.getHttpServer())
      .post('/api/v1/card-payments')
      .set(...authHeader(user.accessToken))
      .send({
        creditCardId: card.id,
        cashAccountId: account.id,
        amount: 10000,
        paymentDate: '2026-10-20',
      })
      .expect(201);

    const response = await preview(user, {
      creditCardId: card.id,
      rows: [
        { purchaseDate: '2026-10-12', description: 'Faltante del corte', amount: 50000 },
        { purchaseDate: '2026-10-16', description: 'Del ciclo abierto', amount: 60000 },
      ],
    }).expect(200);

    expect(response.body.data[0]).toMatchObject({ statementPaid: true });
    expect(response.body.data[1]).toMatchObject({ statementPaid: false });
  });

  it('avisa fechas fuera de rango sin lanzar error', async () => {
    const user = await createVerifiedUser(app, 'import-dates');
    travelTo('2026-10-20');
    const card = await createCard(app, user.accessToken, { cutDay: 15 });

    const response = await preview(user, {
      creditCardId: card.id,
      rows: [
        { purchaseDate: '2026-10-21', description: 'Futura', amount: 100 },
        { purchaseDate: '2026-08-20', description: 'Muy vieja', amount: 100 },
        { purchaseDate: '2026-08-21', description: 'En el limite', amount: 100 },
      ],
    }).expect(200);

    expect(response.body.data.map((row: { dateIssue: string | null }) => row.dateIssue)).toEqual([
      'FUTURE_DATE_NOT_ALLOWED',
      'BACKDATE_LIMIT_EXCEEDED',
      null,
    ]);
  });

  it('rechaza tarjetas ajenas y lotes fuera de rango', async () => {
    const user = await createVerifiedUser(app, 'import-validation');
    const other = await createVerifiedUser(app, 'import-validation-other');
    travelTo('2026-10-20');
    const userCard = await createCard(app, user.accessToken, { cutDay: 15 });
    const otherCard = await createCard(app, other.accessToken, { cutDay: 15 });

    await preview(user, {
      creditCardId: otherCard.id,
      rows: [{ purchaseDate: '2026-10-01', description: 'X', amount: 100 }],
    }).expect(404);

    const rows = Array.from({ length: 501 }, () => ({
      purchaseDate: '2026-10-01',
      description: 'X',
      amount: 100,
    }));
    await preview(user, { creditCardId: userCard.id, rows }).expect(400);
  });

  function importRows(user: TestUser, body: Record<string, unknown>, idempotencyKey?: string) {
    const call = request(app.getHttpServer())
      .post('/api/v1/purchases/import')
      .set(...authHeader(user.accessToken));
    if (idempotencyKey) {
      call.set('Idempotency-Key', idempotencyKey);
    }
    return call.send(body);
  }

  it('importa todas las filas en una transaccion y ocupa credito en su corte', async () => {
    const user = await createVerifiedUser(app, 'import-create');
    travelTo('2026-10-20');
    const card = await createCard(app, user.accessToken, {
      creditLimit: 3000000,
      cutDay: 15,
    });

    const response = await importRows(user, {
      creditCardId: card.id,
      rows: [
        { purchaseDate: '2026-10-04', description: 'Uber', amount: 8997 },
        { purchaseDate: '2026-10-03', description: 'Oxxo', amount: 4450 },
      ],
    }).expect(201);

    expect(response.body.createdCount).toBe(2);
    expect(response.body.purchaseIds).toHaveLength(2);

    // La auditoria distingue el alta manual de la importacion (RN-31).
    const audits = await prisma.auditLog.findMany({
      where: { action: 'purchase.created', entityId: { in: response.body.purchaseIds } },
      select: { changes: true },
    });
    expect(audits).toHaveLength(2);
    for (const audit of audits) {
      const changes = JSON.parse(audit.changes as string) as { origin?: string };
      expect(changes.origin).toBe('IMPORT');
    }

    const list = await request(app.getHttpServer())
      .get('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .expect(200);
    const descriptions = list.body.data
      .map((purchase: { description: string }) => purchase.description)
      .sort();
    expect(descriptions).toEqual(['Oxxo', 'Uber']);
    expect(list.body.data.every((purchase: { type: string }) => purchase.type === 'REGULAR')).toBe(
      true,
    );

    // Los dos cargos caen en el corte del 15 de octubre.
    const statements = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}/statements`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    const october = statements.body.find(
      (statement: { cutDate: string }) => statement.cutDate === '2026-10-15',
    );
    expect(october.cycleCharges).toBe(8997 + 4450);

    const cardAfter = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(cardAfter.body.currentBalance).toBe(8997 + 4450);
  });

  it('no crea nada si una fila tiene fecha fuera de rango', async () => {
    const user = await createVerifiedUser(app, 'import-atomic');
    travelTo('2026-10-20');
    const card = await createCard(app, user.accessToken, {
      creditLimit: 3000000,
      cutDay: 15,
    });

    const response = await importRows(user, {
      creditCardId: card.id,
      rows: [
        { purchaseDate: '2026-10-04', description: 'Valida', amount: 1000 },
        { purchaseDate: '2026-10-21', description: 'Futura', amount: 2000 },
      ],
    }).expect(422);

    expect(response.body.reason).toBe('FUTURE_DATE_NOT_ALLOWED');
    expect(response.body.rowIndex).toBe(1);

    const list = await request(app.getHttpServer())
      .get('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(list.body.data).toHaveLength(0);

    const cardAfter = await request(app.getHttpServer())
      .get(`/api/v1/cards/${card.id}`)
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(cardAfter.body.currentBalance).toBe(0);
  });

  it('rechaza una tarjeta inactiva', async () => {
    const user = await createVerifiedUser(app, 'import-inactive');
    travelTo('2026-10-20');
    const card = await createCard(app, user.accessToken, { cutDay: 15 });
    await request(app.getHttpServer())
      .patch(`/api/v1/cards/${card.id}`)
      .set(...authHeader(user.accessToken))
      .send({ status: 'INACTIVE' })
      .expect(200);

    const response = await importRows(user, {
      creditCardId: card.id,
      rows: [{ purchaseDate: '2026-10-04', description: 'Uber', amount: 8997 }],
    }).expect(422);

    expect(response.body.reason).toBe('CARD_INACTIVE');
  });

  it('es idempotente con la misma llave', async () => {
    const user = await createVerifiedUser(app, 'import-idempotent');
    travelTo('2026-10-20');
    const card = await createCard(app, user.accessToken, {
      creditLimit: 3000000,
      cutDay: 15,
    });
    const body = {
      creditCardId: card.id,
      rows: [{ purchaseDate: '2026-10-04', description: 'Uber', amount: 8997 }],
    };
    const key = 'import-e2e-1234567890';

    const first = await importRows(user, body, key).expect(201);
    const second = await importRows(user, body, key).expect(201);

    expect(second.body).toEqual(first.body);

    const list = await request(app.getHttpServer())
      .get('/api/v1/purchases')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(list.body.data).toHaveLength(1);
  });
});
