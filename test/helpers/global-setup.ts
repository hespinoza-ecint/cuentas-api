import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TEST_DB_POOL_SIZE, testDatabasePath, toDatabaseUrl } from './test-db';

function run(command: string, databaseUrl: string): void {
  const projectRoot = path.resolve(__dirname, '..', '..');

  try {
    execSync(command, {
      cwd: projectRoot,
      env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
  } catch (error) {
    const result = error as { stdout?: Buffer; stderr?: Buffer };
    console.error(`Fallo el comando: ${command}`);
    console.error(result.stdout?.toString() ?? '');
    console.error(result.stderr?.toString() ?? '');
    throw error;
  }
}

/**
 * Prepara el pool de bases de prueba (una por worker de Jest): aplica
 * migraciones y ejecuta el seed dos veces para validar su idempotencia.
 */
export default async function globalSetup(): Promise<void> {
  const directory = path.dirname(testDatabasePath('1'));
  fs.mkdirSync(directory, { recursive: true });

  for (let index = 1; index <= TEST_DB_POOL_SIZE; index += 1) {
    const dbPath = testDatabasePath(String(index));

    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      fs.rmSync(`${dbPath}${suffix}`, { force: true });
    }

    const databaseUrl = toDatabaseUrl(dbPath);
    run('npx prisma migrate deploy', databaseUrl);
    // Dos veces a proposito: valida que el seed sea idempotente.
    run('npx prisma db seed', databaseUrl);
    run('npx prisma db seed', databaseUrl);
  }
}
