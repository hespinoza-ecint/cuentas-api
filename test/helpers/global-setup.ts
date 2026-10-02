import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { testDatabasePath, toDatabaseUrl } from './test-db';

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
 * Prepara una base de datos de prueba limpia: aplica migraciones y ejecuta el seed.
 * Se ejecuta una sola vez por corrida de Jest.
 */
export default async function globalSetup(): Promise<void> {
  const dbPath = testDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }

  const databaseUrl = toDatabaseUrl(dbPath);
  run('npx prisma migrate deploy', databaseUrl);
  // Se ejecuta dos veces a proposito: valida que el seed sea idempotente.
  run('npx prisma db seed', databaseUrl);
  run('npx prisma db seed', databaseUrl);
}
