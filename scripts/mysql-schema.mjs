/**
 * Genera prisma/schema.mysql.prisma a partir del esquema SQLite:
 * - Cambia el proveedor a mysql.
 * - Anota los campos largos (JSON) con @db.Text.
 *
 * Uso: npm run mysql:schema
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'prisma/schema.prisma';
const TARGET = 'prisma/schema.mysql.prisma';

const TEXT_FIELDS = [
  'changes',
  'responseBody',
  'params',
  'requestInput',
  'contextSnapshot',
  'rulesSnapshot',
  'result',
  'config',
];

let schema = readFileSync(SOURCE, 'utf8');
schema = schema.replace('provider = "sqlite"', 'provider = "mysql"');

for (const field of TEXT_FIELDS) {
  const pattern = new RegExp(`(\\b${field}\\s+String\\??)(\\s*\\n)`, 'g');
  schema = schema.replace(pattern, '$1 @db.Text$2');
}

writeFileSync(TARGET, schema);
console.log(`Generado ${TARGET} (proveedor mysql, ${TEXT_FIELDS.length} campos como TEXT).`);
