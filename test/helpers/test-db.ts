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

export function testDatabasePath(): string {
  return path.join(dataDirectory(), 'cuentas.test.db');
}

/** Convierte una ruta de Windows a una URL valida para Prisma/SQLite. */
export function toDatabaseUrl(filePath: string): string {
  return `file:${filePath.replace(/\\/g, '/')}`;
}
