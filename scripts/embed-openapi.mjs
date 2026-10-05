// Reemplaza el bloque OpenAPI 3.1 embebido en la documentacion tecnica por el
// contenido actual de docs/openapi-3.1.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const specPath = 'docs/openapi-3.1.json';
const docPath = process.argv[2] ?? 'docs/documentacion-tecnica-backend.md';

if (!existsSync(docPath)) {
  console.log(`Sin documento que actualizar (${docPath}).`);
  process.exit(0);
}

const spec = readFileSync(specPath, 'utf8').trimEnd();
const doc = readFileSync(docPath, 'utf8');
const pattern = /```json\r?\n\{\r?\n  "openapi": "3\.1\.0",[\s\S]*?\r?\n```/;

if (!pattern.test(doc)) {
  throw new Error('No se encontro el bloque OpenAPI embebido en la documentacion.');
}

const updated = doc.replace(pattern, '```json\n' + spec + '\n```');
writeFileSync(docPath, updated);
console.log(`OpenAPI embebido actualizado en ${docPath}.`);
