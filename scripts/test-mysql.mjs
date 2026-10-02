/**
 * Ejecuta la suite de pruebas contra MySQL.
 *
 * Uso:
 *   npm run test:mysql -- mysql://usuario:contrasena@127.0.0.1:3306
 *
 * Requiere un servidor MySQL accesible y un usuario con permiso de crear
 * bases de datos (cada worker de Jest usa cuentas_test_N).
 */
import { spawnSync } from 'node:child_process';

const url = process.argv[2] ?? process.env.TEST_MYSQL_URL;

if (!url) {
  console.error(
    'Uso: npm run test:mysql -- mysql://usuario:contrasena@127.0.0.1:3306',
  );
  process.exit(1);
}

spawnSync('node', ['scripts/mysql-schema.mjs'], { stdio: 'inherit', shell: true });

const result = spawnSync('npx', ['jest'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    TEST_MYSQL_URL: url,
    TEST_DB_POOL_SIZE: process.env.TEST_DB_POOL_SIZE ?? '5',
  },
});

process.exit(result.status ?? 1);
