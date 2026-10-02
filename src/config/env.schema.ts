import { z } from 'zod';

/**
 * Esquema de validacion de variables de entorno.
 * La aplicacion no arranca si la configuracion es invalida.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Servidor
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  APP_VERSION: z.string().min(1).default('0.1.0'),

  // Base de datos (SQLite ahora, MySQL en el futuro)
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (value) => value.startsWith('file:') || value.startsWith('mysql:'),
      'DATABASE_URL debe ser una URL valida de SQLite (file:...) o MySQL (mysql://...)',
    ),

  // CORS: lista separada por comas
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),

  // Logs
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),

  // Documentacion Swagger
  DOCS_ENABLED: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? true : value === 'true' || value === '1')),

  // Limite global de peticiones
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

  // Autenticacion
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().positive().default(24),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  AUTH_THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60000),
  AUTH_THROTTLE_LIMIT: z.coerce.number().int().positive().default(5),

  // URL de la PWA (enlaces de correo)
  WEB_APP_URL: z.string().url().default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida `process.env` y devuelve la configuracion tipada con valores por defecto aplicados.
 * Se usa como `validate` de `ConfigModule.forRoot`.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuracion de entorno invalida:\n${details}`);
  }

  return result.data;
}
