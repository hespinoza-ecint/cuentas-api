import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { testDatabaseUrl } from './test-db';

function run(command: string, databaseUrl: string): void {
  const projectRoot = path.resolve(__dirname, '..', '..');

  try {
    execSync(command, {
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
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
 * Prepara la base de pruebas en MySQL (Cuentas_Test):
 * - genera `prisma/schema.mysql.prisma` y el cliente de Prisma para MySQL;
 * - resetea la base y aplica el esquema con `prisma db push`;
 * - ejecuta el seed dos veces (valida idempotencia).
 *
 * Jest corre en paralelo contra esta unica base: MySQL soporta varias
 * conexiones, pero dos corridas simultaneas de la suite no deben compartirla.
 */
export default async function globalSetup(): Promise<void> {
  const databaseUrl = testDatabaseUrl();

  run('node scripts/mysql-schema.mjs', databaseUrl);
  run('npx prisma generate --schema prisma/schema.mysql.prisma', databaseUrl);
  run(
    'npx prisma db push --schema prisma/schema.mysql.prisma --force-reset --accept-data-loss --skip-generate',
    databaseUrl,
  );
  run('npx prisma db seed', databaseUrl);
  run('npx prisma db seed', databaseUrl);
}
