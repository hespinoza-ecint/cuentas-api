import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import {
  authHeader,
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

  it('la exportacion incluye perfil, configuracion y version de esquema', async () => {
    const user = await createVerifiedUser(app, 'export');

    const response = await request(app.getHttpServer())
      .get('/api/v1/users/me/export')
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(response.body.schemaVersion).toBe(1);
    expect(response.body.user.email).toBe(user.email);
    expect(response.body.settings.maxUtilizationBps).toBe(3000);
    expect(response.body.exportedAt).toEqual(expect.any(String));
  });
});
