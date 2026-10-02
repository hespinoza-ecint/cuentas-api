import { NestFactory } from '@nestjs/core';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';
import { AppConfigService } from './config/app-config.service';
import { createFastifyAdapter } from './fastify-adapter.factory';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    createFastifyAdapter(),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  await setupApp(app);

  const config = app.get(AppConfigService);
  await app.listen(config.port, config.host);
}

bootstrap().catch((error) => {
  // Configuracion invalida, puerto ocupado o error de base de datos al arrancar.
  console.error('No se pudo iniciar Cuentas API:', error);
  process.exitCode = 1;
});
