import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  TEST_DB_POOL_SIZE,
  isMysqlTests,
  testDatabasePath,
  testDatabaseUrl,
  toDatabaseUrl,
} from './test-db';

function run(command: string, databaseUrl?: string): void {
  const projectRoot = path.resolve(__dirname, '..', '..');

  try {
    execSync(command, {
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
      },
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
 * Prepara el pool de bases de prueba (una por worker de Jest):
 * - SQLite: aplica migraciones y ejecuta el seed dos veces (idempotencia).
 * - MySQL: genera el esquema MySQL y usa `prisma db push` por base.
 */
export default async function globalSetup(): Promise<void> {
  if (isMysqlTests()) {
    run('node scripts/mysql-schema.mjs');

    for (let index = 1; index <= TEST_DB_POOL_SIZE; index += 1) {
      const databaseUrl = testDatabaseUrl(String(index));
      run(
        'npx prisma db push --schema prisma/schema.mysql.prisma --force-reset --accept-data-loss --skip-generate',
        databaseUrl,
      );
      run('npx prisma db seed', databaseUrl);
      run('npx prisma db seed', databaseUrl);
    }
    return;
  }

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
