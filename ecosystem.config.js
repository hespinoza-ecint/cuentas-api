/**
 * Configuracion de PM2 para el VPS (alternativa a Docker).
 * Uso: pm2 start ecosystem.config.js
 *
 * Nota: se usa una sola instancia porque SQLite tiene un solo escritor.
 * Al migrar a MySQL se puede pasar a modo cluster con `instances: 'max'`.
 */
module.exports = {
  apps: [
    {
      name: 'cuentas-api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/error.log',
      out_file: 'logs/output.log',
      merge_logs: true,
      time: true,
    },
  ],
};
