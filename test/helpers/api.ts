import { randomUUID } from 'node:crypto';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { MailService } from '../../src/infrastructure/mail/mail.service';
import { TestMailService } from './test-mail.service';

export const TEST_PASSWORD = 'Password1234';

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${randomUUID()}@test.local`;
}

export function mailService(app: NestFastifyApplication): TestMailService {
  return app.get(MailService) as TestMailService;
}

export async function registerUser(
  app: NestFastifyApplication,
  email: string,
  overrides: Partial<{ firstName: string; lastName: string; password: string }> = {},
): Promise<{ email: string; password: string; userId: string }> {
  const password = overrides.password ?? TEST_PASSWORD;

  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      email,
      password,
      firstName: overrides.firstName ?? 'Test',
      lastName: overrides.lastName ?? 'User',
    })
    .expect(201);

  return { email, password, userId: response.body.user.id as string };
}

export async function verifyUserEmail(
  app: NestFastifyApplication,
  email: string,
): Promise<void> {
  const token = mailService(app).verificationTokenFor(email);
  await request(app.getHttpServer()).post('/api/v1/auth/verify-email').send({ token }).expect(200);
}

export interface LoginResult {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    status: string;
  };
}

export async function loginUser(
  app: NestFastifyApplication,
  email: string,
  password: string = TEST_PASSWORD,
  clientType: 'WEB' | 'NATIVE' = 'NATIVE',
): Promise<LoginResult> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password, clientType })
    .expect(200);

  return response.body as LoginResult;
}

export interface TestUser {
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
  userId: string;
}

/** Registra, verifica el correo e inicia sesion (flujo NATIVE). */
export async function createVerifiedUser(
  app: NestFastifyApplication,
  prefix = 'user',
): Promise<TestUser> {
  const email = uniqueEmail(prefix);
  const { userId } = await registerUser(app, email);
  await verifyUserEmail(app, email);
  const session = await loginUser(app, email);

  return {
    email,
    password: TEST_PASSWORD,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken as string,
    userId,
  };
}

export function authHeader(accessToken: string): [string, string] {
  return ['Authorization', `Bearer ${accessToken}`];
}

export interface CashAccountFixture {
  id: string;
  name: string;
  currentBalance: number;
  isDefault: boolean;
}

export async function createCashAccount(
  app: NestFastifyApplication,
  accessToken: string,
  overrides: {
    name?: string;
    openingBalance?: number;
    type?: string;
    isSpendable?: boolean;
  } = {},
): Promise<CashAccountFixture> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/cash-accounts')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      name: overrides.name ?? `Cuenta ${randomUUID().slice(0, 8)}`,
      ...overrides,
    })
    .expect(201);

  return response.body as CashAccountFixture;
}

export interface CreditCardFixture {
  id: string;
  alias: string;
  currentBalance: number;
  availableCredit: number;
  creditLimit: number;
  status: string;
}

export async function createCard(
  app: NestFastifyApplication,
  accessToken: string,
  overrides: {
    alias?: string;
    institution?: string;
    last4?: string;
    creditLimit?: number;
    annualRateBps?: number;
    cutDay?: number;
    dueDateMode?: string;
    dueDay?: number;
    dueDaysAfterCut?: number;
    dueNonBusinessDayRule?: string;
    sameDayCutIncluded?: boolean;
    openingBalance?: number;
    openingDate?: string;
  } = {},
): Promise<CreditCardFixture> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/cards')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      alias: overrides.alias ?? `Tarjeta ${randomUUID().slice(0, 6)}`,
      institution: 'Banco de Pruebas',
      last4: '4321',
      creditLimit: 2_000_000,
      cutDay: 15,
      dueDaysAfterCut: 20,
      ...overrides,
    })
    .expect(201);

  return response.body as CreditCardFixture;
}
