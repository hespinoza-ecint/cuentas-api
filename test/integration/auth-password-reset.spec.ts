import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { createVerifiedUser, mailService, TEST_PASSWORD, uniqueEmail } from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Recuperacion de contrasena (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('restablece la contrasena, revoca las sesiones y el token es de un solo uso', async () => {
    const user = await createVerifiedUser(app, 'reset');
    const newPassword = 'NuevaPassword123';

    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: user.email })
      .expect(202);

    const token = mailService(app).resetTokenFor(user.email);

    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword })
      .expect(200);

    // Las sesiones anteriores quedaron revocadas.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(401);

    // La contrasena anterior ya no funciona y la nueva si.
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: newPassword })
      .expect(200);

    // El token de restablecimiento no se puede reutilizar.
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'OtraPassword123' })
      .expect(400);
  });

  it('responde 202 para correos desconocidos (sin revelar su existencia)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: uniqueEmail('nadie') })
      .expect(202);

    expect(response.body.message).toContain('Si el correo');
  });
});
