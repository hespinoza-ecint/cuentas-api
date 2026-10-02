import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { registerUser, TEST_PASSWORD, uniqueEmail } from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Inicio de sesion (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('inicia sesion NATIVE con access token y refresh en el cuerpo', async () => {
    const email = uniqueEmail('native');
    await registerUser(app, email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: TEST_PASSWORD, clientType: 'NATIVE' })
      .expect(200);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.tokenType).toBe('Bearer');
    expect(response.body.expiresInSeconds).toBe(900);
    expect(response.body.refreshToken).toEqual(expect.any(String));
    expect(response.body.user.emailVerified).toBe(false);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('inicia sesion WEB con cookie httpOnly y sin refresh en el cuerpo', async () => {
    const email = uniqueEmail('web');
    await registerUser(app, email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: TEST_PASSWORD, clientType: 'WEB' })
      .expect(200);

    expect(response.body.refreshToken).toBeUndefined();
    const setCookie = response.headers['set-cookie'] as unknown as string[];
    const cookieText = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);
    expect(cookieText).toContain('cuentas_refresh=');
    expect(cookieText).toContain('HttpOnly');
    expect(cookieText).toContain('Path=/api/v1/auth');
  });

  it('rechaza credenciales invalidas con 401', async () => {
    const email = uniqueEmail('badpass');
    await registerUser(app, email);

    const wrongPassword = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'Incorrecta123' })
      .expect(401);
    expect(wrongPassword.body.reason).toBe('INVALID_CREDENTIALS');

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail('fantasma'), password: TEST_PASSWORD })
      .expect(401);
  });

  it('bloquea la cuenta despues de 5 intentos fallidos', async () => {
    const email = uniqueEmail('lock');
    await registerUser(app, email);

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'Incorrecta123' })
        .expect(401);
    }

    const fifth = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'Incorrecta123' })
      .expect(423);
    expect(fifth.body.code).toBe('ACCOUNT_LOCKED');

    // Incluso con la contrasena correcta la cuenta sigue bloqueada.
    const correct = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(423);
    expect(correct.body.detail).toContain('bloqueada');
  });
});
