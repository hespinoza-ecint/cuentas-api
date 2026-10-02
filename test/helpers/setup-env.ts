import { testDatabasePath, toDatabaseUrl } from './test-db';

/**
 * Configuracion de entorno para las pruebas. Se ejecuta antes de importar
 * cualquier modulo de la aplicacion, por lo que `process.env` gana sobre `.env`.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = toDatabaseUrl(testDatabasePath());
process.env.LOG_LEVEL = 'silent';
process.env.DOCS_ENABLED = 'true';
process.env.APP_VERSION = '0.0.0-test';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.THROTTLE_TTL_MS = '60000';
process.env.THROTTLE_LIMIT = '1000';
