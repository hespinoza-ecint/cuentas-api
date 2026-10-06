import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { todayInTimeZone } from '../../src/domain/shared/local-date';
import {
  authHeader,
  createCashAccount,
  createVerifiedUser,
  loginUser,
  TEST_PASSWORD,
} from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Eliminacion, cancelacion y exportacion (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('solicita la eliminacion con contrasena, bloquea el acceso y permite cancelar', async () => {
    const user = await createVerifiedUser(app, 'delete');

    await request(app.getHttpServer())
      .post('/api/v1/users/me/delete')
      .set(...authHeader(user.accessToken))
      .send({ password: 'Incorrecta123' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/users/me/delete')
      .set(...authHeader(user.accessToken))
      .send({ password: TEST_PASSWORD })
      .expect(200);

    // Las sesiones quedan revocadas de inmediato.
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set(...authHeader(user.accessToken))
      .expect(401);

    // El login sigue permitido para poder cancelar, pero las rutas quedan bloqueadas.
    const session = await loginUser(app, user.email);
    const blocked = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set(...authHeader(session.accessToken))
      .expect(403);
    expect(blocked.body.reason).toBe('PENDING_DELETION');

    // Exportar los datos si esta permitido.
    const exported = await request(app.getHttpServer())
      .get('/api/v1/users/me/export')
      .set(...authHeader(session.accessToken))
      .expect(200);
    expect(exported.headers['content-disposition']).toContain('cuentas-export');
    expect(JSON.stringify(exported.body)).not.toContain('passwordHash');

    // Cancelar la eliminacion restaura el acceso.
    await request(app.getHttpServer())
      .post('/api/v1/users/me/cancel-deletion')
      .set(...authHeader(session.accessToken))
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set(...authHeader(session.accessToken))
      .expect(200);
  });

  it('la exportacion incluye perfil, configuracion, version de esquema y colecciones financieras', async () => {
    const user = await createVerifiedUser(app, 'export');
    const account = await createCashAccount(app, user.accessToken, { openingBalance: 500000 });

    await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(...authHeader(user.accessToken))
      .send({ name: 'Exportable', kind: 'EXPENSE' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/v1/users/me/export')
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(response.body.schemaVersion).toBe(2);
    expect(response.body.user.email).toBe(user.email);
    expect(response.body.settings.maxUtilizationBps).toBe(3000);
    expect(response.body.exportedAt).toEqual(expect.any(String));
    expect(response.body.financial.cashAccounts).toHaveLength(1);
    expect(response.body.financial.cashAccounts[0].id).toBe(account.id);
    expect(response.body.financial.cashMovements).toHaveLength(1);
    expect(response.body.financial.categories).toHaveLength(1);
    expect(response.body.financial.creditCards).toHaveLength(0);
    expect(
      response.body.financial.cashMovements[0].occurredOn,
    ).toBe(todayInTimeZone('America/Mexico_City'));
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });
});
