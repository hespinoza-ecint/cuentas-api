# Fase 7 — Pruebas y preparación para producción

**Estado:** completada (la corrida contra MySQL queda lista para ejecutarse donde haya un servidor)

## 1. Objetivo

Dejar el backend listo para operar: prueba end-to-end de todo el ciclo, idempotencia en POST financieros, mantenimiento programado (purga y limpieza), estimación de intereses moratorios (RN-22), anualidad proyectada (RN-24), artefactos de despliegue (Docker/PM2), respaldos automatizables y guía de migración a MySQL.

## 2. Lo que se agregó

| Tema | Implementación |
|---|---|
| Prueba E2E | `test/e2e/full-flow.spec.ts` recorre registro → verificación → efectivo → ingreso → tarjeta → recomendación → compra MSI → pago → gasto → exportación → logout → eliminación y cancelación |
| Idempotencia | Interceptor global para los POST financieros marcados con `@Idempotent()`: si llega `Idempotency-Key`, un reintento con la misma llave y cuerpo devuelve la respuesta original (`x-idempotent-replay`); con otra llave y distinto cuerpo responde 409. Endpoints: compras, pagos de tarjeta, anticipos, ajustes y confirmación de ingresos |
| Mantenimiento | `MaintenanceService` con cron diario 03:00 y `POST /admin/maintenance/run` (solo ADMIN): purga cuentas con 30 días de eliminación, limpia sesiones/tokens con más de 30 días e idempotencia vencida |
| RN-22 | Cada corte vencido expone `estimatedInterest` (saldo insoluto × tasa anual / 360 × días × 1.16) y `estimatedInterestDays` |
| RN-24 | La anualidad se proyecta como obligación futura en el motor de recomendaciones |
| Despliegue | `Dockerfile`, `docker-compose.yml` (volumen persistente), `ecosystem.config.js` (PM2) y `.env.production.example` |
| Respaldos | `npm run db:backup`: checkpoint WAL + `VACUUM INTO` con rotación (`BACKUP_RETENTION`) |
| MySQL | `npm run mysql:schema` genera el esquema MySQL (provider + `@db.Text`), el setup de pruebas usa una base por worker y `npm run test:mysql` corre toda la suite contra MySQL |

## 3. Endpoints nuevos

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/v1/admin/maintenance/run` | Ejecuta la purga y limpieza (solo ADMIN) |

## 4. Pruebas

**35 suites, 163 pruebas, todas en verde:**

- `test/e2e/full-flow.spec.ts`: ciclo completo con verificaciones de saldos exactos (1,945,000 tras pagos y gastos; tarjeta en 60,000), exportación sin `passwordHash` y bloqueo por eliminación pendiente.
- `test/integration/idempotency.spec.ts`: reintento con la misma llave no duplica, conflicto con cuerpo distinto, llave inválida, operación normal sin llave.
- `card-statements.spec.ts`: interés estimado de un corte vencido con la fórmula exacta.
- `recommendations.spec.ts`: anualidad proyectada en el snapshot del contexto.

## 5. Despliegue

### Docker (recomendado)

```bash
cp .env.production.example .env.production   # ajustar secretos y dominio
docker compose up -d --build
docker compose logs -f api
```

- La base vive en el volumen `cuentas-data` (`/data/cuentas.db`), fuera de la imagen.
- El contenedor aplica `prisma migrate deploy` al arrancar y expone `/health`.
- Respaldos: ejecutar `npm run db:backup` en el host contra el mismo archivo, o un cron dentro del contenedor (`docker compose exec api node scripts/backup.mjs`).

### PM2 (VPS sin Docker)

```bash
npm ci
npx prisma migrate deploy
npm run build
pm2 start ecosystem.config.js
pm2 save
```

Una sola instancia mientras se use SQLite (un solo escritor). Con MySQL se puede pasar a `instances: 'max'`.

### Operación

| Tarea | Comando |
|---|---|
| Respaldar | `npm run db:backup` (cron sugerido: diario 02:00) |
| Mantenimiento manual | `POST /api/v1/admin/maintenance/run` con token ADMIN |
| Salud | `GET /health` (incluye base de datos) |
| Logs | JSON con `requestId`; en desarrollo legibles con pino-pretty |
| Proxy | Caddy o Nginx con TLS terminando en `:3000`; `HOST=0.0.0.0` |

### Restaurar un respaldo

1. Detener la aplicación.
2. Reemplazar `cuentas.db` por el archivo del respaldo (borrar `-wal` y `-shm`).
3. Arrancar y verificar `GET /health`.

## 6. Seguridad

- [x] Contraseñas con Argon2id; tokens de un solo uso y refresh guardados como hash.
- [x] Access tokens cortos con validación de sesión en cada petición.
- [x] Rotación de refresh con revocación de familia ante robo.
- [x] Cabeceras de seguridad (`@fastify/helmet`), CORS con lista blanca y cookies `httpOnly`/`SameSite=Strict`.
- [x] Límite global y por auth, bloqueo por intentos fallidos y validación estricta de DTOs.
- [x] Aislamiento por usuario con 404 en recursos ajenos; pruebas de autorización entre usuarios.
- [x] Auditoría de operaciones sensibles y financieras.
- [x] Sin datos bancarios sensibles (solo últimos 4 dígitos).
- [x] Idempotencia ante reintentos de red.
- [ ] TLS y dominio: responsabilidad del proxy en el VPS (documentado).
- [ ] Rotación periódica de `JWT_SECRET` y del secreto SMTP: procedimiento manual documentado.

## 7. Migración a MySQL

```bash
# 1) Generar el esquema MySQL
npm run mysql:schema

# 2) Correr la suite completa contra MySQL (crea cuentas_test_1..5)
npm run test:mysql -- mysql://usuario:contrasena@127.0.0.1:3306

# 3) En produccion
#    - Copiar datos con un ETL (o prisma migrate diff + script propio)
#    - Cambiar DATABASE_URL a mysql://...
#    - Aplicar migraciones MySQL generadas y pasar a modo cluster en PM2
```

- El esquema usa `String` para enums/fechas/JSON, enteros de 32 bits y `@db.Text` para los campos largos: no requiere cambios de logica de negocio.
- Las PRAGMA de SQLite se omiten automáticamente cuando la URL no empieza con `file:`.
- **Pendiente de ejecutar en este equipo:** no hay Docker ni servidor MySQL disponibles; la infraestructura y el comando quedan listos. El criterio "el mismo conjunto de pruebas pasa con MySQL" se valida corriendo el paso 2 en una máquina con MySQL.

## 8. Criterios de aceptación

- [x] Prueba end-to-end del ciclo completo en verde.
- [x] Idempotencia en POST financieros (opcional por cabecera, sin romper clientes).
- [x] Mantenimiento programado y manual con purga a 30 días.
- [x] RN-22 (interés estimado) y RN-24 (anualidad) implementados y probados.
- [x] Docker, Compose, PM2 y variables de producción listos.
- [x] Respaldo con rotación probado (`VACUUM INTO`).
- [x] Documentación de API (Swagger en `/api/docs`, 66 rutas) y guía de despliegue.
- [x] 163 pruebas en verde con SQLite.
- [ ] Suite contra MySQL: preparada y documentada, pendiente de un entorno con MySQL.

## 9. Notas finales

- **Pendientes conocidos (backlog):** `REDUCE_PAYMENT` de anticipos, notificaciones, migración real de datos a MySQL y limpieza del aviso de Jest "worker failed to exit gracefully" (no afecta resultados).
- **Advertencias de `npm audit`:** dos avisos heredados de herramientas (CLI de Prisma y `js-yaml` de Swagger); se resolverán al actualizar a Prisma 7 / Swagger 12.
- El proyecto queda con 7 fases cerradas, 6 migraciones, 66 rutas documentadas y 35 suites de pruebas.
