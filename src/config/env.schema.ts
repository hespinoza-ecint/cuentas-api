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
