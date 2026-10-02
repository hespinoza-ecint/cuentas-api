import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { validateEnv } from './env.schema';

/**
 * Modulo global de configuracion: carga y valida el `.env` una sola vez.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
