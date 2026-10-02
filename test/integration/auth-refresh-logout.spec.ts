import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import {
  authHeader,
  createVerifiedUser,
  loginUser,
  registerUser,
  TEST_PASSWORD,
  uniqueEmail,
  verifyUserEmail,
} from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Refresh, logout y sesiones (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rota el refresh token y detecta la reutilizacion revocando la familia', async () => {
    const user = await createVerifiedUser(app, 'rotate');

    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(200);

    const newRefreshToken = rotated.body.refreshToken as string;
    expect(newRefreshToken).toEqual(expect.any(String));
    expect(newRefreshToken).not.toBe(user.refreshToken);

    // Reutilizar el token viejo revoca toda la familia.
    const reuse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(401);
    expect(reuse.body.reason).toBe('REFRESH_TOKEN_REUSED');

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: newRefreshToken })
      .expect(401);
  });

  it('la PWA refresca con cookie y exige un origen permitido', async () => {
    const email = uniqueEmail('web');
    await registerUser(app, email);
    await verifyUserEmail(app, email);

    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ email, password: TEST_PASSWORD, clientType: 'WEB' })
      .expect(200);

    // Cookie sin Origin confiable: se rechaza.
    await agent.post('/api/v1/auth/refresh').send({}).expect(403);

    const refreshed = await agent
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .send({})
      .expect(200);

    expect(refreshed.body.refreshToken).toBeUndefined();
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
  });

  it('logout revoca la sesion de inmediato', async () => {
    const user = await createVerifiedUser(app, 'logout');

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set(...authHeader(user.accessToken))
      .expect(204);

    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set(...authHeader(user.accessToken))
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(401);
  });

  it('logout-all revoca todas las sesiones del usuario', async () => {
    const user = await createVerifiedUser(app, 'all');
    const second = await loginUser(app, user.email);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set(...authHeader(user.accessToken))
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: second.refreshToken as string })
      .expect(401);
  });

  it('lista y revoca sesiones propias; no permite tocar sesiones de otro usuario', async () => {
    const userA = await createVerifiedUser(app, 'a');
    await loginUser(app, userA.email);

    const listA = await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set(...authHeader(userA.accessToken))
      .expect(200);

    expect(listA.body).toHaveLength(2);
    expect((listA.body as Array<{ current: boolean }>).filter((session) => session.current)).toHaveLength(1);

    const otherSession = (listA.body as Array<{ id: string; current: boolean }>).find(
      (session) => !session.current,
    );
    await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${otherSession?.id}`)
      .set(...authHeader(userA.accessToken))
      .expect(204);

    const userB = await createVerifiedUser(app, 'b');
    const listB = await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set(...authHeader(userB.accessToken))
      .expect(200);

    // userA intenta revocar una sesion de userB: 404 para no revelar que existe.
    await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${listB.body[0].id}`)
      .set(...authHeader(userA.accessToken))
      .expect(404);
  });
});
