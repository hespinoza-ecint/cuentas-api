import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/app.setup';
import { createFastifyAdapter } from '../../src/fastify-adapter.factory';
import { MailService } from '../../src/infrastructure/mail/mail.service';
import { TestMailService } from './test-mail.service';

/**
 * Levanta la aplicacion completa (misma configuracion que `main.ts`) contra
 * la base de datos de prueba, con el correo reemplazado por un capturador.
 */
export async function createTestApp(): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(MailService)
    .useClass(TestMailService)
    .compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), {
    logger: false,
  });

  await setupApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return app;
}
