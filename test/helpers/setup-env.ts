import { testDatabaseUrl } from './test-db';

/**
 * Configuracion de entorno para las pruebas. Se ejecuta antes de importar
 * cualquier modulo de la aplicacion, por lo que `process.env` gana sobre `.env`.
 *
 * Cada worker de Jest usa una base distinta (SQLite o MySQL segun TEST_MYSQL_URL).
 */
const workerId = process.env.JEST_WORKER_ID ?? '1';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl(workerId);
process.env.LOG_LEVEL = 'silent';
process.env.DOCS_ENABLED = 'true';
process.env.APP_VERSION = '0.0.0-test';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.THROTTLE_TTL_MS = '60000';
process.env.THROTTLE_LIMIT = '1000';
process.env.JWT_SECRET = 'test-secret-suficientemente-largo-para-las-pruebas-1234567890';
process.env.JWT_ACCESS_TTL_MINUTES = '15';
process.env.JWT_REFRESH_TTL_DAYS = '30';
process.env.AUTH_MAX_FAILED_ATTEMPTS = '5';
process.env.AUTH_LOCK_MINUTES = '15';
process.env.EMAIL_VERIFICATION_TTL_HOURS = '24';
process.env.PASSWORD_RESET_TTL_MINUTES = '30';
process.env.AUTH_THROTTLE_TTL_MS = '60000';
// Limite alto en pruebas: el bloqueo por intentos fallidos se prueba por separado.
process.env.AUTH_THROTTLE_LIMIT = '1000';
process.env.WEB_APP_URL = 'http://localhost:5173';
