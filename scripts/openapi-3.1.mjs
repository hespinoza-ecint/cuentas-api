/**
 * Convierte la especificacion OpenAPI 3.0 que genera NestJS a OpenAPI 3.1:
 * - Cambia la version a 3.1.0.
 * - Reemplaza `nullable: true` por tipos unidos con "null" (JSON Schema 2020-12).
 *
 * Uso:
 *   node scripts/openapi-3.1.mjs docs/openapi.json docs/openapi-3.1.json
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [source = 'docs/openapi.json', target = 'docs/openapi-3.1.json'] = process.argv.slice(2);

function convertNode(node) {
  if (Array.isArray(node)) {
    return node.map(convertNode);
  }
  if (node === null || typeof node !== 'object') {
    return node;
  }

  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'nullable') {
      continue;
    }
    result[key] = convertNode(value);
  }

  if (node.nullable === true) {
    if (typeof result.type === 'string') {
      result.type = [result.type, 'null'];
    } else if (Array.isArray(result.type) && !result.type.includes('null')) {
      result.type = [...result.type, 'null'];
    }
  }

  return result;
}

const spec = JSON.parse(readFileSync(source, 'utf8'));
const converted = convertNode(spec);
converted.openapi = '3.1.0';

writeFileSync(target, `${JSON.stringify(converted, null, 2)}\n`);
console.log(`Generado ${target} (OpenAPI ${converted.openapi}, ${Object.keys(converted.paths).length} rutas).`);
