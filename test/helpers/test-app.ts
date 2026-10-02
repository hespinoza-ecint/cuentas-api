import { NestFactory } from '@nestjs/core';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/app.setup';
import { createFastifyAdapter } from '../../src/fastify-adapter.factory';

/**
 * Levanta la aplicacion completa (misma configuracion que `main.ts`)
 * contra la base de datos de prueba.
 */
export async function createTestApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter(), {
    logger: false,
  });

  await setupApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return app;
}
