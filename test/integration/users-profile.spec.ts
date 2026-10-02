import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import {
  authHeader,
  createVerifiedUser,
  loginUser,
  TEST_PASSWORD,
} from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Perfil y configuracion (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('exige autenticacion en /users/me', async () => {
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
  });

  it('devuelve y actualiza el perfil sin exponer el hash', async () => {
    const user = await createVerifiedUser(app, 'profile');

    const me = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(me.body.email).toBe(user.email);
    expect(JSON.stringify(me.body)).not.toContain('passwordHash');

    const updated = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set(...authHeader(user.accessToken))
      .send({ firstName: 'Nuevo' })
      .expect(200);

    expect(updated.body.firstName).toBe('Nuevo');
    expect(updated.body.lastName).toBe('User');
  });

  it('rechaza campos no permitidos (whitelist)', async () => {
    const user = await createVerifiedUser(app, 'whitelist');

    const response = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set(...authHeader(user.accessToken))
      .send({ role: 'ADMIN' })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('lee y actualiza la configuracion financiera con validacion', async () => {
    const user = await createVerifiedUser(app, 'settings');

    const settings = await request(app.getHttpServer())
      .get('/api/v1/users/me/settings')
      .set(...authHeader(user.accessToken))
      .expect(200);

    expect(settings.body.timezone).toBe('America/Mexico_City');
    expect(settings.body.maxUtilizationBps).toBe(3000);
    expect(settings.body.variableIncomeFactorBps).toBe(9000);

    const updated = await request(app.getHttpServer())
      .patch('/api/v1/users/me/settings')
      .set(...authHeader(user.accessToken))
      .send({ minCashBuffer: 150000, maxUtilizationBps: 2500 })
      .expect(200);

    expect(updated.body.minCashBuffer).toBe(150000);
    expect(updated.body.maxUtilizationBps).toBe(2500);

    await request(app.getHttpServer())
      .patch('/api/v1/users/me/settings')
      .set(...authHeader(user.accessToken))
      .send({ maxUtilizationBps: 20000 })
      .expect(400);
  });

  it('cambia la contrasena y cierra las demas sesiones', async () => {
    const user = await createVerifiedUser(app, 'chpass');
    const second = await loginUser(app, user.email);
    const newPassword = 'NuevaPassword123';

    await request(app.getHttpServer())
      .post('/api/v1/users/me/change-password')
      .set(...authHeader(user.accessToken))
      .send({ currentPassword: 'Incorrecta123', newPassword })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/users/me/change-password')
      .set(...authHeader(user.accessToken))
      .send({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/users/me/change-password')
      .set(...authHeader(user.accessToken))
      .send({ currentPassword: TEST_PASSWORD, newPassword })
      .expect(200);

    // La sesion actual sigue activa; la segunda quedo revocada.
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set(...authHeader(user.accessToken))
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set(...authHeader(second.accessToken))
      .expect(401);

    // La contrasena nueva funciona; la anterior no.
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: newPassword })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD })
      .expect(401);
  });
});
