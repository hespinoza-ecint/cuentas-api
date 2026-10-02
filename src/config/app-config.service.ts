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

  private read<K extends keyof Env>(key: K): Env[K] {
    return this.configService.get(key, { infer: true }) as Env[K];
  }
}
