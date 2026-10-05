# Fase 8 — Soporte al frontend (proyección de flujo, dashboard y categorías propias)

## 1. Objetivo

Completar el backend con las piezas que el frontend (PWA) necesita para un dashboard
completo y eficiente, sin recorrer páginas en el cliente ni duplicar cálculos:

1. `GET /cashflow/projection` — proyección de flujo de efectivo día a día.
2. `GET /dashboard/summary` — resumen agregado para el inicio.
3. CRUD de categorías propias (`POST/PATCH/DELETE /categories`).

## 2. Lo que se agregó

| Pieza | Descripción |
|---|---|
| `CashflowContextService` | Extrae el armado del contexto que antes vivía en `RecommendationsService` (cuentas, tarjetas, ingresos y gastos programados, cortes, mensualidades y anualidades). Ahora el motor de recomendaciones, la proyección y el dashboard usan **la misma fuente de datos**. |
| `CashflowModule` | `GET /cashflow/projection` con horizonte configurable (1–365 días, default 60). |
| `DashboardModule` | `GET /dashboard/summary` con agregaciones en base de datos (sin recorrer listados). |
| Categorías propias | Crear, editar y eliminar (borrado lógico) categorías del usuario; las del sistema son de solo lectura. |
| Pruebas | 3 suites de integración nuevas: `cashflow.spec.ts`, `dashboard.spec.ts`, `categories.spec.ts`. |

El refactor del contexto **no cambió el comportamiento del motor**: las 35 suites
previas (incluidas las del motor con snapshots) siguen pasando.

## 3. Endpoints nuevos

### GET `/api/v1/cashflow/projection?days=60`

```json
{
  "today": "2026-10-05",
  "timezone": "America/Mexico_City",
  "horizonDays": 60,
  "startingBalance": 500000,
  "minCashBuffer": 0,
  "points": [
    {
      "date": "2026-10-06",
      "inflows": 0,
      "outflows": 700000,
      "balance": -200000,
      "events": [
        { "type": "RECURRING_EXPENSE", "description": "Renta", "amount": -700000, "recurringExpenseId": "uuid" }
      ]
    },
    {
      "date": "2026-10-08",
      "inflows": 100000,
      "outflows": 0,
      "balance": -100000,
      "events": [
        { "type": "INCOME", "description": "Bono", "amount": 100000, "incomeSourceId": "uuid", "incomeScheduleId": "uuid" }
      ]
    }
  ],
  "minimum": { "date": "2026-10-06", "balance": -200000 },
  "finalBalance": -100000,
  "belowBuffer": true
}
```

Tipos de evento: `INCOME`, `RECURRING_EXPENSE`, `CARD_STATEMENT`, `INSTALLMENT`,
`ANNUAL_FEE`. Los montos van con signo (positivo entra al efectivo). El mínimo
arranca en el saldo de hoy y solo cambia cuando el saldo cae por debajo.

### GET `/api/v1/dashboard/summary?month=YYYY-MM`

- `cash`: saldo gastable, saldo total y número de cuentas activas.
- `cards`: deuda total, crédito disponible total y por tarjeta `utilizationBps`,
  próximo corte, próxima fecha límite y pago pendiente del corte.
- `upcomingIncome`: total e items de los próximos 30 días (RN-10/RN-11 aplicadas).
- `upcomingPayments`: total e items (recurrentes, cortes, mensualidades y anualidades).
- `expenses`: gasto del mes vs mes anterior y top 3 categorías.
- `lastRecommendation`: última recomendación con tarjeta, puntaje y resultado.

### Categorías propias

| Método | Ruta | Notas |
|---|---|---|
| POST | `/categories` | `{ name, kind, parentId?, icon? }`; nombre único por usuario (sin distinguir mayúsculas) |
| PATCH | `/categories/:id` | Cualquier subconjunto; `parentId: null` desliga del padre |
| DELETE | `/categories/:id` | Borrado lógico; bloquea si tiene subcategorías activas |

Errores: `409 CATEGORY_NAME_TAKEN`, `400 PARENT_CATEGORY_NOT_FOUND`,
`400 CATEGORY_NESTING_LIMIT` (un solo nivel), `400 CATEGORY_KIND_MISMATCH`,
`422 SYSTEM_CATEGORY_READ_ONLY`, `422 CATEGORY_HAS_CHILDREN`.

## 4. Pruebas

```powershell
npm.cmd test
```

Suites nuevas:

- **cashflow**: proyección con ingresos/gastos (mínimo y `belowBuffer` correctos),
  obligaciones de tarjeta del corte vigente, caso sin eventos, validación de días
  y 401 sin token.
- **dashboard**: resumen completo con saldos, utilización, próximos movimientos,
  gasto del mes con top de categorías y última recomendación; mes explícito y
  validación de formato.
- **categories**: jerarquía (un nivel), nombres duplicados, tipos compatibles,
  categorías del sistema, aislamiento entre usuarios y correo verificado.

## 5. Notas

- El contexto compartido permite que la proyección y el motor **nunca se
  desincronicen**; cualquier cambio de reglas (gracia de ingresos, anualidades,
  cortes) aplica en un solo lugar.
- `GET /dashboard/summary` usa `aggregate`/`groupBy` de Prisma, no recorridos.
- La documentación técnica (`docs/documentacion-tecnica-backend.md`) y la
  especificación OpenAPI se actualizaron con los nuevos endpoints.
