// Arranque del backend para E2E: aplica migraciones y seed, y levanta la API.
// Lo usa el webServer de Playwright con DATABASE_URL apuntando a la base E2E.
//   node scripts/e2e-server.mjs
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const run = (command) => {
  console.log(`[e2e-server] ${command}`);
  execSync(command, { stdio: 'inherit', env: process.env });
};

if (!existsSync('dist/main.js')) {
  run('npm.cmd run build');
}

run('npx.cmd prisma migrate deploy');
run('npx.cmd prisma db seed');

// Pequena pausa para que el proceso del seed termine de soltar la base.
await new Promise((resolve) => setTimeout(resolve, 1000));

const child = spawn('node', ['dist/main.js'], { stdio: 'inherit', env: process.env });

const stop = () => {
  child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
