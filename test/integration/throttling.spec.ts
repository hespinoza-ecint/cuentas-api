import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { ProblemDetailsFilter } from '../../src/common/errors/problem-details.filter';

@Controller('ping')
class PingController {
  @Get()
  ping(): { ok: boolean } {
    return { ok: true };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60000, limit: 2 }],
      errorMessage: 'Demasiadas solicitudes. Espera un momento antes de reintentar.',
    }),
  ],
  controllers: [PingController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class ThrottleTestModule {}

describe('Limite de peticiones (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottleTestModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 429 en formato problem+json al exceder el limite', async () => {
    await request(app.getHttpServer()).get('/ping').expect(200);
    await request(app.getHttpServer()).get('/ping').expect(200);

    const response = await request(app.getHttpServer()).get('/ping').expect(429);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body.status).toBe(429);
    expect(response.body.code).toBe('TOO_MANY_REQUESTS');
    expect(response.body.detail).toContain('Demasiadas solicitudes');
  });
});
