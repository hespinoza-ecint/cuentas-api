import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule, Params } from 'nestjs-pino';
import { AppConfigModule } from './config/app-config.module';
import { AppConfigService } from './config/app-config.service';
import { ClockModule } from './infrastructure/clock/clock.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { VerifiedEmailGuard } from './modules/auth/guards/verified-email.guard';
import { CardLedgerModule } from './modules/card-ledger/card-ledger.module';
import { CardPaymentsModule } from './modules/card-payments/card-payments.module';
import { CardsModule } from './modules/cards/cards.module';
import { CashAccountsModule } from './modules/cash-accounts/cash-accounts.module';
import { CashMovementsModule } from './modules/cash-movements/cash-movements.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { HealthModule } from './modules/health/health.module';
import { IncomeModule } from './modules/income/income.module';
import { InstallmentsModule } from './modules/installments/installments.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { UsersModule } from './modules/users/users.module';

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
    ClockModule,
    LedgerModule,
    CardLedgerModule,
    InstallmentsModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    CashAccountsModule,
    CashMovementsModule,
    ExpensesModule,
    IncomeModule,
    CardsModule,
    CardPaymentsModule,
    PurchasesModule,
    RecommendationsModule,
    HealthModule,
  ],
  providers: [
    // Orden de ejecucion de guards globales:
    // 1) limite de peticiones, 2) autenticacion, 3) roles, 4) correo verificado.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: VerifiedEmailGuard },
  ],
})
export class AppModule {}
