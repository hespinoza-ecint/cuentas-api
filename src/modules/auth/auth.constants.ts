export const REFRESH_COOKIE_NAME = 'cuentas_refresh';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export const TOKEN_TYPE_EMAIL_VERIFY = 'EMAIL_VERIFY';
export const TOKEN_TYPE_PASSWORD_RESET = 'PASSWORD_RESET';

export const CLIENT_TYPES = ['WEB', 'NATIVE'] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

/**
 * Limite de peticiones para las rutas de autenticacion.
 * Se lee del entorno en tiempo de definicion porque el decorador `@Throttle`
 * necesita valores estaticos; en pruebas se eleva el limite para poder
 * ejercitar bloqueos y reintentos.
 */
export const AUTH_THROTTLE = {
  default: {
    limit: Number(process.env.AUTH_THROTTLE_LIMIT ?? 5),
    ttl: Number(process.env.AUTH_THROTTLE_TTL_MS ?? 60000),
  },
} as const;
