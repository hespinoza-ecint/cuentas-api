# Fase 3 — Saldo, ingresos y movimientos

**Estado:** completada

## 1. Objetivo

Implementar el libro de efectivo (cuentas, saldo inicial, movimientos, ajustes, transferencias y reversos), los calendarios de ingreso con reglas de días hábiles, la confirmación de ingresos reales, los gastos con sus recurrentes y el recálculo del saldo. Estas piezas son la materia prima del motor de recomendaciones (Fase 6).

## 2. Decisiones técnicas

| Tema | Decisión |
|---|---|
| Fuente de verdad | `CashMovement` es un libro de solo inserción; `CashAccount.currentBalance` es caché con `balanceVersion` |
| Única puerta de escritura | `LedgerService` crea todo movimiento y actualiza la caché en la misma transacción (RN-05) |
| Ajustes | Exigen `reason` obligatorio y quedan auditados (RN-05) |
| Reversos | Un movimiento solo se revierte una vez (`reversesMovementId` único); un reverso no se revierte (RN-26) |
| Fechas | No se aceptan movimientos con fecha futura; los flujos futuros se modelan como ingresos/gastos programados (RN-07) |
| Fechas pasadas | Hasta `backdateLimitDays` (60 por defecto) según la configuración del usuario (RN-06) |
| Saldo inicial | Un `OPENING_BALANCE` por cuenta; se puede registrar al crear la cuenta o después (una sola vez) |
| Transferencias | Dos movimientos `TRANSFER_OUT` / `TRANSFER_IN` ligados por `sourceId` |
| Recalcular | `POST /cash-accounts/:id/recalculate` suma el libro, corrige la caché si difiere y audita el ajuste |
| Calendarios (dominio) | Funciones puras: `local-date`, `business-calendar`, `schedule-generator` (sin NestJS ni Prisma) |
| RN-08 | BIWEEKLY por defecto `[15, último del mes]`; también admite días fijos |
| RN-09 | `PREVIOUS` (default) / `NEXT` / `NONE`, considerando fines de semana y el calendario de festivos del usuario |
| RN-10 | Los ingresos `VARIABLE` se proyectan al 90% (configurable); el `expectedAmount` guardado es el estimado sin factor |
| RN-11 | Las fechas vencidas dejan de proyectarse después de `pendingIncomeGraceDays` (3 por defecto) |
| Fechas futuras | Se calculan al momento; solo se guardan al confirmar u omitir (`IncomeTransaction`) |
| Gastos recurrentes | Al confirmar una ocurrencia se crea el `Expense` y su movimiento; duplicados → 409 |
| Correo verificado | Todas las mutaciones financieras exigen `@RequireVerifiedEmail()`; las lecturas no |
| Categorías | Endpoint de solo lectura con categorías globales + propias y validación de tipo (gasto/ingreso) |

## 3. Estructura creada

```
src/domain/shared/local-date.ts             fechas de calendario puras
src/domain/calendar/business-calendar.ts    fines de semana, festivos y ajustes
src/domain/schedules/schedule-config.ts     validación Zod de calendarios
src/domain/schedules/schedule-generator.ts  generación de próximas fechas
src/infrastructure/clock/clock.module.ts    ClockService (hoy por zona horaria)
src/modules/ledger/                         LedgerService (libro y caché de saldo)
src/modules/cash-accounts/                  cuentas, saldo inicial, transferencias, recálculo
src/modules/cash-movements/                 listado, ajustes y reversos
src/modules/categories/                     catálogo de categorías
src/modules/holidays/                       calendario de festivos
src/modules/expenses/                       gastos y gastos recurrentes
src/modules/income/                         fuentes, calendarios, próximos pagos y confirmaciones
prisma/migrations/20261002170033_cash_accounts_income_expenses/
```

## 4. Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET/POST | `/api/v1/cash-accounts` | Lista y crea cuentas (con saldo inicial opcional) |
| GET/PATCH/DELETE | `/api/v1/cash-accounts/:id` | Detalle, edición y borrado lógico (solo con saldo cero) |
| POST | `/api/v1/cash-accounts/:id/opening-balance` | Registra el saldo inicial (una vez) |
| POST | `/api/v1/cash-accounts/:id/recalculate` | Recalcula el saldo desde el libro |
| POST | `/api/v1/cash-accounts/transfer` | Transferencia entre cuentas |
| GET | `/api/v1/cash-movements` | Listado con filtros y cursor |
| GET | `/api/v1/cash-movements/:id` | Detalle |
| POST | `/api/v1/cash-movements/adjustments` | Ajuste manual con motivo |
| POST | `/api/v1/cash-movements/:id/reverse` | Reverso |
| GET | `/api/v1/categories?kind=` | Categorías globales y propias |
| GET/POST | `/api/v1/expenses` | Listado y registro de gastos |
| GET | `/api/v1/expenses/:id` | Detalle |
| POST | `/api/v1/expenses/:id/reverse` | Reverso del gasto |
| GET/POST | `/api/v1/recurring-expenses` | Gastos recurrentes |
| GET/PATCH/DELETE | `/api/v1/recurring-expenses/:id` | Detalle, edición y borrado lógico |
| GET | `/api/v1/recurring-expenses/upcoming` | Próximas ocurrencias |
| GET | `/api/v1/recurring-expenses/:id/upcoming` | Próximas ocurrencias de uno |
| POST | `/api/v1/recurring-expenses/:id/confirm` | Confirma una ocurrencia |
| GET/POST | `/api/v1/income/sources` | Fuentes de ingreso con calendarios |
| GET/PATCH/DELETE | `/api/v1/income/sources/:id` | Detalle, edición y borrado lógico |
| POST | `/api/v1/income/sources/:id/schedules` | Agrega un calendario |
| PATCH/DELETE | `/api/v1/income/sources/:id/schedules/:scheduleId` | Edita y desactiva un calendario |
| GET | `/api/v1/income/upcoming` | Próximos ingresos estimados |
| GET | `/api/v1/income/transactions` | Historial de confirmaciones y omisiones |
| POST | `/api/v1/income/transactions/confirm` | Confirma un ingreso real |
| POST | `/api/v1/income/transactions/skip` | Omite una fecha estimada |

## 5. Migración

`20261002170033_cash_accounts_income_expenses` crea: `CashAccount`, `CashMovement`, `IncomeSource`, `IncomeSchedule`, `IncomeTransaction`, `RecurringExpense` y `Expense`.

## 6. Pruebas

| Archivo | Tipo | Qué valida |
|---|---|---|
| `local-date.spec.ts` | Unitaria | Fechas reales, sumas, meses, zonas horarias |
| `business-calendar.spec.ts` | Unitaria | RN-09: fines de semana, festivos y cadenas |
| `schedule-generator.spec.ts` | Unitaria | RN-08, frecuencias, ajustes, duplicados, límites |
| `cash-accounts.spec.ts` | Integración | Saldo inicial, predeterminada única, transferencias, recálculo, borrado, verificación de correo, aislamiento |
| `cash-movements.spec.ts` | Integración | Ajustes, reverso único, fechas inválidas, paginación, aislamiento |
| `expenses.spec.ts` | Integración | Registro, categoría correcta, reverso |
| `recurring-expenses.spec.ts` | Integración | Ajuste de fin de semana, confirmación, duplicados, borrado lógico |
| `income.spec.ts` | Integración | RN-08, RN-10, RN-11, confirmación, omisión, aislamiento |

**Total del proyecto: 25 suites, 104 pruebas en verde.**

Infraestructura de pruebas: cada worker de Jest usa su propia base SQLite (`cuentas.test.N.db`), con WAL y `busy_timeout`. Esto eliminó la contención de escritura que causaba errores intermitentes.

## 7. Validación end-to-end ejecutada

```
LOGIN ok
CUENTA ok: saldo=500000 default=True
AJUSTE ok: ADJUSTMENT -50000
GASTO ok: Supermercado 25000
INGRESO ok: config={"days":[15,"LAST"]} regla=PREVIOUS
PROXIMOS ok: 6 fechas, primera=2026-10-15
CONFIRMACION ok: CONFIRMED
SALDO FINAL: 1925000 (esperado 1925000)
MOVIMIENTOS: 4 registrados
DOCS ok: 26 rutas de la fase 3 documentadas
```

## 8. Criterios de aceptación

- [x] La caché del saldo coincide con el libro (verificado por el endpoint de recálculo y pruebas).
- [x] Ningún saldo se modifica sin un movimiento (RN-05) y los ajustes exigen motivo.
- [x] Saldo inicial registrable una sola vez por cuenta.
- [x] Transferencias atómicas con dos movimientos ligados.
- [x] Reversos únicos y auditados.
- [x] RN-06: límite de días hacia atrás configurable; fechas futuras rechazadas.
- [x] RN-08, RN-09, RN-10 y RN-11 cubiertas por pruebas unitarias y de integración.
- [x] Próximas fechas calculadas en vivo (sin datos obsoletos si cambia el calendario).
- [x] Confirmación de ingresos reales distintos del estimado.
- [x] Gastos y recurrentes con confirmación que genera gasto + movimiento.
- [x] Aislamiento por usuario y 404 para recursos ajenos.
- [x] Auditoría de cuentas, movimientos, ajustes, reversos, gastos e ingresos.
- [x] 104 pruebas en verde y validación real end-to-end.

## 9. Notas

- **Atribución de montos:** `expectedAmount` de una ocurrencia guarda el estimado; `expectedAmount` de la proyección (`/income/upcoming`) aplica el factor conservador de RN-10.
- **Reschedule:** el estado `RESCHEDULED` existe en el modelo, pero la reprogramación de fechas se implementará cuando la PWA la necesite; hoy se cubren confirmar y omitir.
- **Tarjetas:** los gastos recurrentes tienen `paymentMethod`, pero en esta fase solo se admite `CASH_ACCOUNT`; `CREDIT_CARD` se habilita en la Fase 4.
- **Purga y limpieza:** la eliminación de datos vencidos y tareas programadas quedan para la Fase 7.
- **Siguiente fase:** Tarjetas de crédito (cortes, estados de cuenta, libro de tarjeta y pagos).
