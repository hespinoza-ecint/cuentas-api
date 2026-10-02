/**
 * Respaldo consistente de SQLite: hace checkpoint del WAL y usa VACUUM INTO
 * para generar una copia limpia, sin bloquear la aplicacion mas de lo necesario.
 *
 * Uso: npm run db:backup
 * Variables:
 *   DATABASE_URL      (obligatoria, file:...)
 *   BACKUP_DIR        (opcional, por defecto <carpeta de la base>/backups)
 *   BACKUP_RETENTION  (opcional, respaldos a conservar; por defecto 14)
 */
import { PrismaClient } from '@prisma/client';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || !databaseUrl.startsWith('file:')) {
  console.error('El respaldo solo aplica a SQLite (DATABASE_URL debe iniciar con file:).');
  process.exit(1);
}

const sourcePath = databaseUrl.replace(/^file:/, '');
const backupDir = process.env.BACKUP_DIR ?? path.join(path.dirname(sourcePath), 'backups');
const retention = Number(process.env.BACKUP_RETENTION ?? 14);

mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(backupDir, `cuentas-${stamp}.db`);

const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

try {
  await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
  const escapedTarget = target.replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${escapedTarget}';`);
  console.log(`Respaldo creado: ${target}`);
} finally {
  await prisma.$disconnect();
}

const backups = readdirSync(backupDir)
  .filter((file) => file.startsWith('cuentas-') && file.endsWith('.db'))
  .sort();

for (const old of backups.slice(0, Math.max(backups.length - retention, 0))) {
  rmSync(path.join(backupDir, old));
  console.log(`Respaldo antiguo eliminado: ${old}`);
}
