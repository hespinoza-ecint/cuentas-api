/**
 * Genera prisma/schema.mysql.prisma a partir del esquema SQLite:
 * - Cambia el proveedor a mysql.
 * - Anota como @db.Text los campos que pueden exceder el VARCHAR(191) por
 *   defecto de Prisma (JSON serializado, descripciones, motivos, notas y
 *   user-agents).
 * - El correo pasa a @db.VarChar(254) (el DTO acepta hasta 254 caracteres y
 *   sigue siendo único).
 *
 * Uso: npm run mysql:schema
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'prisma/schema.prisma';
const TARGET = 'prisma/schema.mysql.prisma';

// Campos de texto libre o JSON que no caben en VARCHAR(191).
const TEXT_FIELDS = [
  'changes',
  'responseBody',
  'requestInput',
  'contextSnapshot',
  'rulesSnapshot',
  'result',
  'config',
  'params',
  'description',
  'reason',
  'notes',
  'userAgent',
  'deviceName',
];

let schema = readFileSync(SOURCE, 'utf8');
schema = schema.replace('provider = "sqlite"', 'provider = "mysql"');

let annotated = 0;
for (const field of TEXT_FIELDS) {
  const pattern = new RegExp(`^(\\s*${field}\\s+String\\??)(.*)$`, 'gm');
  schema = schema.replace(pattern, (match, head, tail) => {
    if (tail.includes('@db.')) {
      return match;
    }
    annotated += 1;
    return `${head} @db.Text${tail}`;
  });
}

// El correo debe soportar 254 caracteres y sigue siendo unico.
schema = schema.replace(
  /^(\s*email\s+String)(\s*@unique.*)$/m,
  (match, head, tail) => {
    if (head.includes('@db.')) {
      return match;
    }
    annotated += 1;
    return `${head} @db.VarChar(254)${tail}`;
  },
);

writeFileSync(TARGET, schema);
console.log(
  `Generado ${TARGET} (proveedor mysql, ${annotated} campos con @db.Text o VarChar).`,
);
