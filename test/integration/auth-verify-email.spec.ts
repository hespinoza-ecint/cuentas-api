import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { mailService, registerUser, uniqueEmail, verifyUserEmail } from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Verificacion de correo (integracion)', () => {
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

  it('verifica el correo y marca la cuenta como ACTIVE', async () => {
    const email = uniqueEmail('verify');
    const { userId } = await registerUser(app, email);

    await verifyUserEmail(app, email);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.emailVerifiedAt).not.toBeNull();
    expect(user?.status).toBe('ACTIVE');

    const token = await prisma.verificationToken.findFirst({
      where: { userId, type: 'EMAIL_VERIFY' },
    });
    expect(token?.usedAt).not.toBeNull();
  });

  it('rechaza un token ya utilizado', async () => {
    const email = uniqueEmail('reuse');
    await registerUser(app, email);

    const token = mailService(app).verificationTokenFor(email);
    await request(app.getHttpServer()).post('/api/v1/auth/verify-email').send({ token }).expect(200);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token })
      .expect(400);

    expect(response.body.reason).toBe('INVALID_VERIFICATION_TOKEN');
  });

  it('reenviar la verificacion invalida el token anterior', async () => {
    const email = uniqueEmail('resend');
    await registerUser(app, email);

    const firstToken = mailService(app).verificationTokenFor(email);
    await request(app.getHttpServer())
      .post('/api/v1/auth/resend-verification')
      .send({ email })
      .expect(202);

    const secondToken = mailService(app).verificationTokenFor(email);
    expect(secondToken).not.toBe(firstToken);

    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: firstToken })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: secondToken })
      .expect(200);
  });

  it('responde 202 para correos no registrados (sin revelar su existencia)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/resend-verification')
      .send({ email: uniqueEmail('nadie') })
      .expect(202);

    expect(response.body.message).toContain('Si el correo');
  });
});
