import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from './env.schema';

/**
 * Acceso tipado a la configuracion validada de la aplicacion.
 * El resto del codigo nunca debe leer `process.env` directamente.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService<Env, true>) {}

  get nodeEnv(): Env['NODE_ENV'] {
    return this.read('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }

  get host(): string {
    return this.read('HOST');
  }

  get port(): number {
    return this.read('PORT');
  }

  get appVersion(): string {
    return this.read('APP_VERSION');
  }

  get databaseUrl(): string {
    return this.read('DATABASE_URL');
  }

  get corsOrigins(): string[] {
    return this.read('CORS_ORIGINS');
  }

  get logLevel(): Env['LOG_LEVEL'] {
    return this.read('LOG_LEVEL');
  }

  get docsEnabled(): boolean {
    return this.read('DOCS_ENABLED');
  }

  get throttleTtlMs(): number {
    return this.read('THROTTLE_TTL_MS');
  }

  get throttleLimit(): number {
    return this.read('THROTTLE_LIMIT');
  }

  get jwtSecret(): string {
    return this.read('JWT_SECRET');
  }

  get jwtAccessTtlMinutes(): number {
    return this.read('JWT_ACCESS_TTL_MINUTES');
  }

  get jwtRefreshTtlDays(): number {
    return this.read('JWT_REFRESH_TTL_DAYS');
  }

  get authMaxFailedAttempts(): number {
    return this.read('AUTH_MAX_FAILED_ATTEMPTS');
  }

  get authLockMinutes(): number {
    return this.read('AUTH_LOCK_MINUTES');
  }

  get emailVerificationTtlHours(): number {
    return this.read('EMAIL_VERIFICATION_TTL_HOURS');
  }

  get passwordResetTtlMinutes(): number {
    return this.read('PASSWORD_RESET_TTL_MINUTES');
  }

  get authThrottleTtlMs(): number {
    return this.read('AUTH_THROTTLE_TTL_MS');
  }

  get authThrottleLimit(): number {
    return this.read('AUTH_THROTTLE_LIMIT');
  }

  get webAppUrl(): string {
    return this.read('WEB_APP_URL');
  }

  /** La cookie de refresh solo viaja por HTTPS en produccion. */
  get cookieSecure(): boolean {
    return this.isProduction;
  }

  private read<K extends keyof Env>(key: K): Env[K] {
    return this.configService.get(key, { infer: true }) as Env[K];
  }
}
