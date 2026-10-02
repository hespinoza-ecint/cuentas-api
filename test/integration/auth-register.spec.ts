import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { registerUser, TEST_PASSWORD, uniqueEmail } from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Registro de usuarios (integracion)', () => {
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

  it('crea la cuenta con configuracion por defecto, hash argon2id y auditoria', async () => {
    const email = uniqueEmail('register');
    const { userId } = await registerUser(app, email, { firstName: 'Ana', lastName: 'Lopez' });

    const dbUser = await prisma.user.findUnique({ where: { email }, include: { settings: true } });

    expect(dbUser).not.toBeNull();
    expect(dbUser?.passwordHash).not.toBe(TEST_PASSWORD);
    expect(dbUser?.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(dbUser?.status).toBe('PENDING_VERIFICATION');
    expect(dbUser?.emailVerifiedAt).toBeNull();
    expect(dbUser?.settings?.maxUtilizationBps).toBe(3000);
    expect(dbUser?.settings?.timezone).toBe('America/Mexico_City');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'auth.register', userId },
    });
    expect(audit).not.toBeNull();

    const token = await prisma.verificationToken.findFirst({
      where: { userId, type: 'EMAIL_VERIFY' },
    });
    expect(token?.usedAt).toBeNull();
    expect(token?.tokenHash).toHaveLength(64);
  });

  it('normaliza el correo a minusculas y sin espacios', async () => {
    const email = uniqueEmail('mixed');

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `  ${email.toUpperCase()}  `,
        password: TEST_PASSWORD,
        firstName: 'Mix',
        lastName: 'Case',
      })
      .expect(201);

    expect(response.body.user.email).toBe(email);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('rechaza un correo ya registrado con 409', async () => {
    const email = uniqueEmail('dup');
    await registerUser(app, email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, firstName: 'Dup', lastName: 'Licate' })
      .expect(409);

    expect(response.body.code).toBe('CONFLICT');
    expect(response.body.reason).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('rechaza datos invalidos con 400 y errores por campo', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'no-es-correo', password: 'corta' })
      .expect(400);

    const fields = (response.body.errors as Array<{ field: string }>).map((error) => error.field);
    expect(fields).toEqual(expect.arrayContaining(['email', 'password', 'firstName', 'lastName']));
  });
});
