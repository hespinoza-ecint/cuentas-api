// Arranque del backend para E2E contra la base MySQL de pruebas Cuentas_Test:
// genera el esquema/cliente MySQL, resetea la base, siembra y levanta la API.
// Lo usa el webServer de Playwright con DATABASE_URL apuntando a esa base.
//   node scripts/e2e-server.mjs
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const run = (command) => {
  console.log(`[e2e-server] ${command}`);
  execSync(command, { stdio: 'inherit', env: process.env });
};

const databaseName = (() => {
  try {
    return decodeURIComponent(new URL(process.env.DATABASE_URL ?? '').pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
})();

if (databaseName !== 'Cuentas_Test') {
  console.error(
    `[e2e-server] DATABASE_URL debe apuntar a la base Cuentas_Test (recibida: ${databaseName || 'vacia'}).`,
  );
  process.exit(1);
}

run('node scripts/mysql-schema.mjs');
run('npx.cmd prisma generate --schema prisma/schema.mysql.prisma');

if (!existsSync('dist/main.js')) {
  run('npm.cmd run build');
}

run(
  'npx.cmd prisma db push --schema prisma/schema.mysql.prisma --force-reset --accept-data-loss --skip-generate',
);
run('npx.cmd prisma db seed');

// Pequena pausa para que el proceso del seed termine de soltar la conexion.
await new Promise((resolve) => setTimeout(resolve, 1000));

const child = spawn('node', ['dist/main.js'], { stdio: 'inherit', env: process.env });

const stop = () => {
  child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
