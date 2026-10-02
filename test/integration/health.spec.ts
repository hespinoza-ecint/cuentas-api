import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { createTestApp } from '../helpers/test-app';

describe('Salud y documentacion (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /health responde 200 con la base de datos arriba', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.version).toBe('0.0.0-test');
    expect(response.body.checks.database.status).toBe('up');
    expect(response.body.checks.database.latencyMs).toEqual(expect.any(Number));
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('GET /health/live responde 200', async () => {
    const response = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(response.body.status).toBe('ok');
  });

  it('la documentacion OpenAPI esta disponible en /api/docs-json', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(response.body.info.title).toBe('Cuentas API');
    expect(response.body.paths['/health']).toBeDefined();
  });
});
