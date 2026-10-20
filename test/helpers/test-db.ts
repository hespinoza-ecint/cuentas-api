import * as fs from 'node:fs';
import * as path from 'node:path';

/** Base de datos MySQL reservada para las pruebas. Cualquier otra se rechaza. */
export const TEST_DATABASE_NAME = 'Cuentas_Test';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function readDatabaseUrlFromEnvFile(): string | undefined {
  const envPath = path.join(PROJECT_ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    return undefined;
  }

  const match = fs.readFileSync(envPath, 'utf8').match(/^\s*DATABASE_URL\s*=\s*(.+)$/m);
  return match?.[1].trim();
}

/**
 * Aborta si la URL no apunta exactamente a la base de pruebas.
 *
 * El nombre distingue mayusculas en el servidor (lower_case_table_names = 0),
 * asi que `cuentas_test` tampoco es valido. El seguro evita que un
 * `prisma db push --force-reset` borre la base de desarrollo o produccion.
 */
export function assertTestDatabase(databaseUrl: string): void {
  let parsed: URL;

  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      `DATABASE_URL no es una URL valida. Las pruebas solo pueden usar la base ${TEST_DATABASE_NAME}.`,
    );
  }

  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));

  if (name !== TEST_DATABASE_NAME) {
    throw new Error(
      `Las pruebas solo pueden usar la base ${TEST_DATABASE_NAME} (recibida: ${name || 'vacia'}).`,
    );
  }
}

/**
 * URL de la base de pruebas. Se deriva de DATABASE_URL en `.env` cambiando el
 * nombre de la base; TEST_DATABASE_URL permite sobreescribirla por completo.
 *
 * TEST_DB_CONNECTION_LIMIT ajusta el pool de cada proceso (por defecto 5).
 */
export function testDatabaseUrl(): string {
  const source =
    process.env.TEST_DATABASE_URL ??
    readDatabaseUrlFromEnvFile() ??
    process.env.DATABASE_URL;

  if (!source) {
    throw new Error(
      'Falta DATABASE_URL en .env (o TEST_DATABASE_URL) para derivar la base de pruebas.',
    );
  }

  const url = new URL(source);
  if (url.protocol !== 'mysql:') {
    throw new Error(
      `Las pruebas requieren MySQL (mysql://...). DATABASE_URL apunta a: ${url.protocol}`,
    );
  }

  url.pathname = `/${TEST_DATABASE_NAME}`;
  url.searchParams.set('connection_limit', process.env.TEST_DB_CONNECTION_LIMIT ?? '5');

  const databaseUrl = url.toString();
  assertTestDatabase(databaseUrl);

  return databaseUrl;
}
