import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { createTestApp } from '../helpers/test-app';

describe('Rutas desconocidas (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('responde 404 en formato problem+json', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/no-existe').expect(404);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({
      type: 'about:blank',
      status: 404,
      code: 'NOT_FOUND',
      instance: '/api/v1/no-existe',
    });
    expect(response.body.requestId).toEqual(expect.any(String));
    expect(response.body.timestamp).toEqual(expect.any(String));
  });
});
