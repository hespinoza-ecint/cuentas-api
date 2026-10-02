# Fase 1 — Base del backend

**Estado:** completada

## 1. Objetivo

Dejar un proyecto TypeScript profesional que sirva de cimiento para todas las fases: servidor NestJS + Fastify, base SQLite con Prisma, configuración validada, manejo centralizado de errores, validación de entradas, logging estructurado, documentación Swagger y datos iniciales (categorías y festivos de México).

## 2. Decisiones técnicas

| Tema | Decisión |
|---|---|
| Framework | NestJS 11 sobre Fastify |
| ORM | Prisma 6 (`prisma-client-js`) |
| Base de datos | SQLite con `journal_mode=WAL` y `busy_timeout=5000` |
| Ubicación de la BD | Fuera de OneDrive (`%LOCALAPPDATA%\Cuentas\data\cuentas.db`) |
| Dinero | Enteros en centavos (`Int`); tasas en puntos base |
| Estados/enums | `String` validado en la aplicación (portabilidad a MySQL) |
| Configuración | `.env` validado con Zod; la app no arranca con configuración inválida |
| Errores | RFC 9457 (`application/problem+json`) con `code` estable |
| Trazabilidad | `x-request-id` en todas las respuestas; se respeta el entrante |
| Validación | `ValidationPipe` global; sin conversión implícita de tipos |
| Logging | `nestjs-pino`, JSON, `requestId` por petición, campos sensibles redactados |
| Seguridad | `@fastify/helmet`, CORS por lista blanca, `@nestjs/throttler` global |
| Documentación | Swagger UI en `/api/docs` |

## 3. Estructura creada

```
cuentas-api/
├─ prisma/
│  ├─ schema.prisma              (Users, UserSettings, Categories, Holidays, AuditLogs, IdempotencyRecords)
│  ├─ migrations/                (migración inicial - se genera con prisma migrate dev)
│  └─ seed/
│     ├─ index.ts                (seed idempotente)
│     └─ data/
│        ├─ categories.ts        (20 categorías padre y 42 subcategorías)
│        └─ holidays.ts          (MX_LABOR y MX_BANKING, 2026-2027)
├─ src/
│  ├─ main.ts                    (bootstrap)
│  ├─ app.module.ts              (módulos, logger, throttler)
│  ├─ app.setup.ts               (helmet, CORS, prefijo, pipes, filtros, Swagger)
│  ├─ config/
│  │  ├─ env.schema.ts           (validación Zod)
│  │  ├─ app-config.service.ts   (acceso tipado)
│  │  └─ app-config.module.ts
│  ├─ common/
│  │  ├─ errors/                 (AppError, errores HTTP, problem details, filtro)
│  │  └─ validation/             (flatten de errores, pipe global)
│  ├─ infrastructure/prisma/     (PrismaService con WAL)
│  └─ modules/health/            (health checks)
└─ test/
   ├─ unit/                      (env y problem details)
   ├─ integration/               (health, 404, validación, throttling, seed)
   └─ helpers/                   (BD de prueba, setup global, app de prueba)
```

## 4. Comandos

```powershell
cd "C:\Users\Hector.Espinoza\OneDrive - ECI\Devs\Cuentas\cuentas-api"
npm.cmd install
New-Item -ItemType Directory -Force -Path "$env:LOCALAPPDATA\Cuentas\data"
npx.cmd prisma migrate dev --name init
npx.cmd prisma db seed

npm.cmd run lint
npm.cmd run build
npm.cmd run test
npm.cmd run start:dev
```

## 5. Migración inicial y seed

- La migración inicial crea: `User`, `UserSettings`, `Category`, `Holiday`, `AuditLog`, `IdempotencyRecord`.
- El seed carga:
  - 20 categorías globales de sistema (14 de gasto, 6 de ingreso) y 42 subcategorías.
  - Festivos `MX_LABOR` (14) y `MX_BANKING` (22) para 2026 y 2027.
- El seed es **idempotente**: ejecutarlo dos veces no duplica registros (las pruebas lo verifican).

## 6. Pruebas

| Archivo | Tipo | Qué valida |
|---|---|---|
| `test/unit/config/env.schema.spec.ts` | Unitaria | Valores por defecto, conversiones y rechazo de configuración inválida |
| `test/unit/common/problem-details.factory.spec.ts` | Unitaria | Mapeo de AppError, HttpException, errores de Prisma y errores desconocidos |
| `test/integration/health.spec.ts` | Integración | `/health`, `/health/live` y OpenAPI |
| `test/integration/not-found.spec.ts` | Integración | 404 uniforme en `application/problem+json` |
| `test/integration/validation.spec.ts` | Integración | 400 con errores por campo y rechazo de propiedades extra |
| `test/integration/throttling.spec.ts` | Integración | 429 en `application/problem+json` |
| `test/integration/seed.spec.ts` | Integración | Categorías, festivos, idempotencia y WAL |

Las pruebas usan una base separada: `%LOCALAPPDATA%\Cuentas\data\cuentas.test.db`. El `globalSetup` la recrea, aplica migraciones y ejecuta el seed dos veces.

## 7. Cómo validar

1. `npm.cmd run lint` — sin errores.
2. `npm.cmd run build` — compila a `dist/`.
3. `npm.cmd run test` — todas las suites en verde.
4. `npm.cmd run start:dev` y visitar:
   - `http://localhost:3000/health` → `{ "status": "ok", ... }`
   - `http://localhost:3000/api/docs` → Swagger UI
   - `http://localhost:3000/api/v1/no-existe` → error RFC 9457

## 8. Criterios de aceptación

- [x] El proyecto compila y pasa ESLint.
- [x] La app no arranca con variables de entorno inválidas o faltantes.
- [x] SQLite fuera de OneDrive, en modo WAL y con `busy_timeout`.
- [x] Migración inicial aplicada y seed idempotente cargado.
- [x] `/health` reporta el estado de la base de datos.
- [x] Todos los errores (400, 404, 429, 500, 503) responden `application/problem+json` con `code`, `detail`, `instance`, `requestId` y `timestamp`.
- [x] Todas las respuestas incluyen `x-request-id` (se respeta el entrante).
- [x] Los logs son JSON con `requestId`; se redactan contraseñas, tokens y cookies.
- [x] Swagger disponible en `/api/docs`.
- [x] Límite global de peticiones activo (429 controlado).
- [x] Pruebas unitarias y de integración en verde, incluida la verificación de WAL.

## 9. Notas

- En este equipo `npm.ps1` está bloqueado por la política de PowerShell; usa `npm.cmd` y `npx.cmd`.
- `fastify` se fija en `5.12.5` con un `override` de npm porque `@nestjs/platform-fastify@11.2.7` declara exactamente `5.11.3`, versión con CVE de severidad alta. Es el mismo major (5.x) y las pruebas y la validación en producción pasan con él. Al migrar a Nest 12 se podrá retirar el override.
- `npm audit` reporta dos avisos heredados de herramientas:
  - `deepmerge-ts` a través del CLI de Prisma (solo se usa al generar migraciones; entrada confiable).
  - `js-yaml` a través de `@nestjs/swagger` (se usa para el endpoint YAML de la documentación).
  Ambos se resolverán al actualizar a Prisma 7 y Swagger 12 cuando se migre a Nest 12 (Fase 7).
- En las pruebas la UI de Swagger se desactiva (`ui: false`) y solo se sirve `/api/docs-json`, porque `@fastify/static` depende de módulos ESM que el runtime CommonJS de Jest no puede cargar. En desarrollo y producción la UI funciona (verificado).
- Jest muestra la advertencia "A worker process has failed to exit gracefully": no afecta los resultados (24/24 pruebas). Se revisará con `--detectOpenHandles` en la Fase 7.
- La migración a MySQL (Fase 7) implicará:
  1. Cambiar `provider` a `mysql` en `prisma/schema.prisma`.
  2. Añadir anotaciones `@db.Text`/`@db.VarChar` donde aplique.
  3. Generar migraciones nuevas con una base MySQL vacía.
  4. Migrar datos (script ETL o `prisma migrate diff` + copia).
- La tabla `IdempotencyRecord` ya existe; el interceptor que la usa se implementa con los primeros POST financieros (Fase 3).
