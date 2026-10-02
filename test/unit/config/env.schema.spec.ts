import { validateEnv } from '../../../src/config/env.schema';

describe('validateEnv', () => {
  const validConfig = {
    DATABASE_URL: 'file:C:/tmp/test.db',
    JWT_SECRET: 'secreto-de-pruebas-con-mas-de-32-caracteres-123456',
  };

  it('aplica valores por defecto', () => {
    const env = validateEnv({ ...validConfig });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.HOST).toBe('0.0.0.0');
    expect(env.DOCS_ENABLED).toBe(true);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173']);
    expect(env.THROTTLE_LIMIT).toBe(100);
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('convierte CORS_ORIGINS a lista y DOCS_ENABLED a booleano', () => {
    const env = validateEnv({
      ...validConfig,
      CORS_ORIGINS: 'http://a.test, http://b.test',
      DOCS_ENABLED: 'false',
    });

    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
    expect(env.DOCS_ENABLED).toBe(false);
  });

  it('rechaza DATABASE_URL ausente', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rechaza DATABASE_URL con esquema no soportado', () => {
    expect(() => validateEnv({ DATABASE_URL: 'postgresql://localhost/db' })).toThrow(/SQLite/);
  });

  it('rechaza PORT invalido', () => {
    expect(() => validateEnv({ ...validConfig, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rechaza JWT_SECRET ausente o demasiado corto', () => {
    expect(() => validateEnv({ DATABASE_URL: 'file:C:/tmp/test.db' })).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...validConfig, JWT_SECRET: 'corto' })).toThrow(/JWT_SECRET/);
  });

  it('rechaza LOG_LEVEL desconocido', () => {
    expect(() => validateEnv({ ...validConfig, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });
});
