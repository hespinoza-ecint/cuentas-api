# Cuentas API

Backend del asistente financiero **Cuentas**: ayuda a decidir qué tarjeta de crédito conviene usar en una compra y controla el flujo de efectivo del usuario.

> Las recomendaciones son **estimaciones** basadas en la información que registra el usuario. No constituyen asesoría financiera profesional.

## Estado del proyecto

| Fase | Descripción | Estado |
|---|---|---|
| 0 | Análisis, reglas de negocio, arquitectura y modelo de datos | ✅ Cerrada |
| 1 | Base del backend (proyecto, SQLite + Prisma, configuración, errores, logs, Swagger, seed) | ✅ Implementada |
| 2 | Usuarios y autenticación | ✅ Implementada |
| 3 | Saldo, ingresos y movimientos | ✅ Implementada |
| 4 | Tarjetas de crédito | ✅ Implementada |
| 5 | Compras y mensualidades | ⏳ Pendiente |
| 6 | Motor de recomendaciones | ⏳ Pendiente |
| 7 | Pruebas y preparación para producción | ⏳ Pendiente |

El documento de la Fase 0 (reglas de negocio RN-01 a RN-26, modelo de datos completo y plan por fases) está en:
`C:\Users\Hector.Espinoza\OneDrive - ECI\Devs\Plan\Cuentas-Fase-0-Arquitectura-y-Plan.md`

## Tecnologías

- **Node.js 24** + **TypeScript 5.9**
- **NestJS 11** (`@nestjs/core` 11.2.7) sobre **Fastify 5.12.5**
  (fastify se fija con un `override` de npm: Nest 11 declara 5.11.3, que tiene vulnerabilidades conocidas; al migrar a Nest 12 se podrá retirar)
- **Prisma 6.19.3** con **SQLite** (migrable a MySQL)
- **Zod 4** para validar variables de entorno y configuración JSON
- **class-validator** para validar DTOs
- **nestjs-pino 5** para logs estructurados
- **Argon2id** (`@node-rs/argon2`) para contraseñas
- **JWT** (`@nestjs/jwt`) con rotación de refresh tokens
- **Swagger** (OpenAPI 3) en `/api/docs`
- **Jest + Supertest** para pruebas

## Requisitos

- Node.js 22 o superior (probado con 24)
- npm 11 o superior
- En Windows, si PowerShell bloquea `npm.ps1`, usa `npm.cmd` (política de ejecución de scripts)

## Instalación

```powershell
cd "C:\Users\Hector.Espinoza\OneDrive - ECI\Devs\Cuentas\cuentas-api"
npm.cmd install

# Carpeta de la base de datos (fuera de OneDrive)
New-Item -ItemType Directory -Force -Path "$env:LOCALAPPDATA\Cuentas\data"

# Migraciones y datos iniciales
npx.cmd prisma migrate dev
npx.cmd prisma db seed
```

## Configuración

Toda la configuración vive en `.env` (ver `.env.example`). La aplicación **no arranca** si la configuración es inválida.

| Variable | Descripción | Ejemplo |
|---|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` | `development` |
| `HOST` / `PORT` | Dirección y puerto del servidor | `0.0.0.0` / `3000` |
| `DATABASE_URL` | URL de SQLite o MySQL | `file:C:/Users/.../Cuentas/data/cuentas.db` |
| `CORS_ORIGINS` | Orígenes permitidos, separados por coma | `http://localhost:5173` |
| `LOG_LEVEL` | Nivel de logs de pino | `debug` |
| `DOCS_ENABLED` | Habilita Swagger en `/api/docs` | `true` |
| `THROTTLE_TTL_MS` / `THROTTLE_LIMIT` | Límite global de peticiones por IP | `60000` / `100` |

> **Importante:** la base SQLite debe estar **fuera de OneDrive**. OneDrive sincroniza los archivos `-wal` y `-shm` mientras la aplicación escribe y puede corromper la base.

## Comandos

| Comando | Descripción |
|---|---|
| `npm.cmd run start:dev` | Servidor en modo desarrollo (watch) |
| `npm.cmd run build` | Compila a `dist/` |
| `npm.cmd run start:prod` | Ejecuta la compilación |
| `npm.cmd run test` | Pruebas unitarias y de integración |
| `npm.cmd run test:cov` | Pruebas con cobertura |
| `npm.cmd run lint` | ESLint |
| `npm.cmd run format` | Prettier |
| `npm.cmd run prisma:migrate` | Nueva migración en desarrollo |
| `npm.cmd run prisma:deploy` | Aplica migraciones (producción) |
| `npm.cmd run db:seed` | Datos iniciales |
| `npm.cmd run db:studio` | Explorador visual de la base |

## Estructura

```
cuentas-api/
├─ prisma/            Esquema, migraciones y seed
├─ src/
│  ├─ config/         Validación de entorno (Zod) y acceso tipado
│  ├─ common/         Errores RFC 9457, validación, utilidades
│  ├─ infrastructure/ Prisma y servicios externos
│  ├─ domain/         Lógica financiera pura (fases 3 a 6)
│  └─ modules/        Módulos HTTP (health, y los de fases siguientes)
├─ test/              Unitarias, integración, autorización, helpers
└─ docs/              Documentación por fase
```

## Endpoints actuales

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servicio y de la base de datos |
| GET | `/health/live` | Liveness del proceso |
| POST | `/api/v1/auth/register` | Registro de usuario |
| POST | `/api/v1/auth/login` | Inicio de sesión (WEB usa cookie; NATIVE recibe refresh en el cuerpo) |
| POST | `/api/v1/auth/refresh` | Rotación del refresh token |
| POST | `/api/v1/auth/logout` | Cierra la sesión actual |
| POST | `/api/v1/auth/logout-all` | Cierra todas las sesiones |
| GET | `/api/v1/auth/sessions` | Lista las sesiones activas propias |
| DELETE | `/api/v1/auth/sessions/:id` | Revoca una sesión propia |
| POST | `/api/v1/auth/verify-email` | Verifica el correo |
| POST | `/api/v1/auth/resend-verification` | Reenvía la verificación |
| POST | `/api/v1/auth/forgot-password` | Solicita restablecer contraseña |
| POST | `/api/v1/auth/reset-password` | Restablece la contraseña |
| GET | `/api/v1/users/me` | Perfil del usuario |
| PATCH | `/api/v1/users/me` | Actualiza el perfil |
| POST | `/api/v1/users/me/change-password` | Cambia la contraseña |
| GET/PATCH | `/api/v1/users/me/settings` | Consulta y actualiza la configuración financiera |
| POST | `/api/v1/users/me/delete` | Solicita la eliminación (30 días de gracia) |
| POST | `/api/v1/users/me/cancel-deletion` | Cancela la eliminación |
| GET | `/api/v1/users/me/export` | Exporta los datos en JSON |
| GET/POST | `/api/v1/cash-accounts` | Cuentas de efectivo y saldo inicial |
| GET/PATCH/DELETE | `/api/v1/cash-accounts/:id` | Detalle, edición y borrado |
| POST | `/api/v1/cash-accounts/transfer` | Transferencia entre cuentas |
| POST | `/api/v1/cash-accounts/:id/recalculate` | Recalcula el saldo desde el libro |
| GET | `/api/v1/cash-movements` | Libro de movimientos con filtros |
| POST | `/api/v1/cash-movements/adjustments` | Ajuste manual con motivo |
| POST | `/api/v1/cash-movements/:id/reverse` | Reverso de un movimiento |
| GET | `/api/v1/categories` | Categorías globales y propias |
| GET/POST | `/api/v1/expenses` | Gastos |
| POST | `/api/v1/expenses/:id/reverse` | Reverso de un gasto |
| GET/POST | `/api/v1/recurring-expenses` | Gastos recurrentes |
| GET | `/api/v1/recurring-expenses/upcoming` | Próximas ocurrencias |
| POST | `/api/v1/recurring-expenses/:id/confirm` | Confirma una ocurrencia |
| GET/POST | `/api/v1/income/sources` | Fuentes de ingreso y calendarios |
| GET | `/api/v1/income/upcoming` | Próximos ingresos estimados (RN-08 a RN-11) |
| GET | `/api/v1/income/transactions` | Historial de ingresos confirmados/omitidos |
| POST | `/api/v1/income/transactions/confirm` | Confirma un ingreso real |
| POST | `/api/v1/income/transactions/skip` | Omite una fecha estimada |
| GET/POST | `/api/v1/cards` | Tarjetas de crédito y saldo inicial |
| GET/PATCH/DELETE | `/api/v1/cards/:id` | Detalle, edición y borrado |
| POST | `/api/v1/cards/:id/reconcile` | Conciliación con el banco |
| GET | `/api/v1/cards/:id/ledger` | Libro de la tarjeta |
| GET | `/api/v1/cards/:id/statements` | Estados de cuenta (cortes) |
| GET | `/api/v1/cards/:id/statements/current` | Ciclo abierto y próximo corte |
| PATCH | `/api/v1/cards/:id/statements/:statementId` | Montos reportados del corte |
| GET/POST | `/api/v1/card-payments` | Pagos de tarjeta |
| POST | `/api/v1/card-payments/:id/reverse` | Reverso de un pago |
| GET | `/api/docs` | Documentación interactiva (Swagger UI) |
| GET | `/api/docs-json` | Especificación OpenAPI |

## Convenciones de la API

- Prefijo versionado `/api/v1` (los endpoints de salud quedan fuera).
- Montos en **centavos enteros**; tasas en **puntos base**.
- Fechas de calendario `YYYY-MM-DD`; fechas y horas en ISO-8601 UTC.
- Errores en formato **RFC 9457** (`application/problem+json`) con `code`, `detail`, `instance`, `requestId` y `timestamp`.
- Todas las respuestas incluyen el encabezado `x-request-id` para correlacionar con los logs (se respeta el `x-request-id` entrante).
- Paginación por cursor en las colecciones.
- `Idempotency-Key` en POST financieros (se implementa en las fases 3+).

## Documentación por fase

- [Fase 1 — Base del backend](docs/fase-01-base.md)
- [Fase 2 — Usuarios y autenticación](docs/fase-02-auth.md)
- [Fase 3 — Saldo, ingresos y movimientos](docs/fase-03-cashflow.md)
- [Fase 4 — Tarjetas de crédito](docs/fase-04-cards.md)
