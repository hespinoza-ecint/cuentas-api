/**
 * Genera el SQL de creacion de la base MySQL (primera instalacion):
 *   prisma/mysql/init.sql
 *
 * No se conecta a la base: crea el esquema completo con `prisma migrate diff`
 * desde vacio. En el servidor se aplica con:
 *   mysql -h <host> -u <usuario> -p <basedatos> < prisma/mysql/init.sql
 * o con:  npm run mysql:apply
 *
 * Uso: npm run mysql:sql
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

execSync('node scripts/mysql-schema.mjs', { stdio: 'inherit' });

const sql = execSync(
  'npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.mysql.prisma --script',
  { encoding: 'utf8' },
);

mkdirSync('prisma/mysql', { recursive: true });
writeFileSync('prisma/mysql/init.sql', sql);

const tables = (sql.match(/CREATE TABLE/gi) ?? []).length;
console.log(`Generado prisma/mysql/init.sql (${tables} tablas).`);
