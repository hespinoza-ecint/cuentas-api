import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule, Params } from 'nestjs-pino';
import { AppConfigModule } from './config/app-config.module';
import { AppConfigService } from './config/app-config.service';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';

function buildLoggerOptions(config: AppConfigService): Params {
  return {
    pinoHttp: {
      level: config.logLevel,
      // El id de peticion lo genera Fastify (ver fastify-adapter.factory.ts)
      // y pino-http lo reutiliza automaticamente.
      autoLogging: {
        // Los endpoints de salud no se registran para no llenar los logs.
        ignore: (req) => req.url === '/health' || req.url === '/health/live',
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          'req.body.password',
          'req.body.currentPassword',
          'req.body.newPassword',
          'req.body.refreshToken',
        ],
        censor: '[REDACTED]',
      },
      transport: config.isDevelopment
        ? {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    },
  };
}

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: buildLoggerOptions,
    }),
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.throttleTtlMs,
            limit: config.throttleLimit,
          },
        ],
        errorMessage: 'Demasiadas solicitudes. Espera un momento antes de reintentar.',
      }),
    }),
    PrismaModule,
    HealthModule,
  ],
  providers: [
    // Limite global de peticiones por IP. En la Fase 2 se agregan limites mas
    // estrictos a las rutas de autenticacion.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
