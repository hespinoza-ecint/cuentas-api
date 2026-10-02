import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Carpeta de datos local del usuario, fuera de OneDrive.
 * Se puede sobreescribir con la variable TEST_DB_DIR (por ejemplo en CI).
 */
export function dataDirectory(): string {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  return process.env.TEST_DB_DIR ?? path.join(localAppData, 'Cuentas', 'data');
}

/**
 * Cada worker de Jest usa su propia base SQLite para evitar contencion de
 * escritura entre suites que corren en paralelo.
 */
export function testDatabasePath(workerId = '1'): string {
  return path.join(dataDirectory(), `cuentas.test.${workerId}.db`);
}

/** Numero de bases del pool (>= numero maximo de workers de Jest). */
export const TEST_DB_POOL_SIZE = Number(process.env.TEST_DB_POOL_SIZE ?? 5);

/** Convierte una ruta de Windows a una URL valida para Prisma/SQLite. */
export function toDatabaseUrl(filePath: string): string {
  return `file:${filePath.replace(/\\/g, '/')}`;
}
