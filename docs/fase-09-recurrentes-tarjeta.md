# Fase 9 — Gastos recurrentes pagados con tarjeta de crédito

## 1. Objetivo

Permitir que un gasto recurrente (renta, servicios, suscripciones…) se pague con
**tarjeta de crédito**, no solo con una cuenta de efectivo. La lista de próximas
ocurrencias y la confirmación son las mismas; al confirmar, el backend decide si
genera un **gasto** (efectivo) o una **compra** (tarjeta) con su cargo en el libro.

## 2. Lo que se agregó

| Pieza | Descripción |
|---|---|
| `RecurringExpense.cashAccountId` | Ahora opcional (`String?`). |
| `RecurringExpense.creditCardId` | Nuevo FK opcional → `CreditCard` (Restrict). |
| `RecurringExpense.paymentMethod` | `CASH_ACCOUNT` \| `CREDIT_CARD`; deja de ser “reservado”. |
| Único `Purchase (recurringExpenseId, occurrenceDate)` | Evita confirmar dos veces la misma ocurrencia con tarjeta (mismo patrón que `Expense`). |
| `PurchasesService.create(..., origin?)` | Parámetro interno que liga la compra a la ocurrencia (`recurringExpenseId` + `occurrenceDate`); valida que el recurrente sea del usuario y que la compra sea `REGULAR`. |
| `RecurringExpensesService.confirm` | Ramifica: efectivo → `Expense` + `CashMovement`; tarjeta → `Purchase` + `CardLedgerEntry`. |
| Listado/detalle de recurrentes | Incluye `cashAccount {id,name}` y `creditCard {id,alias,last4}` para la UI. |
| Pruebas | 2 pruebas de integración nuevas en `recurring-expenses.spec.ts` (flujo tarjeta + validaciones y cambio de método). |

## 3. Reglas y validaciones

- `paymentMethod` define el destino; si se omite se infiere del id enviado.
- Sin método ni destino → `400 PAYMENT_METHOD_REQUIRED`.
- `CASH_ACCOUNT` sin `cashAccountId` → `400 CASH_ACCOUNT_REQUIRED`.
- `CREDIT_CARD` sin `creditCardId` → `400 CREDIT_CARD_REQUIRED`.
- Tarjeta de otro usuario/inexistente → `404 CARD_NOT_FOUND`; inactiva → `422 CARD_INACTIVE`.
- Se puede cambiar de método con `PATCH` enviando `paymentMethod` + el id destino.
- La ocurrencia confirmada (gasto **o** compra) deja de aparecer en `upcoming`.
- Confirmar dos veces la misma ocurrencia → `409 OCCURRENCE_ALREADY_CONFIRMED`.

## 4. Endpoints afectados

| Método | Ruta | Cambio |
|---|---|---|
| POST | `/recurring-expenses` | Acepta `paymentMethod?`, `cashAccountId?`, `creditCardId?`. |
| PATCH | `/recurring-expenses/:id` | Acepta `paymentMethod?`, `creditCardId?`; permite cambiar de método. |
| GET | `/recurring-expenses` / `:id` | Incluye `cashAccount` y `creditCard`. |
| POST | `/recurring-expenses/:id/confirm` | Respuesta `{ expenseId, movementId }` (efectivo) o `{ purchaseId }` (tarjeta). |

### Ejemplo

```json
// POST /recurring-expenses
{ "name": "Streaming", "amount": 30000, "paymentMethod": "CREDIT_CARD",
  "creditCardId": "uuid-tarjeta",
  "schedule": { "frequency": "MONTHLY", "config": { "day": 15 }, "startDate": "2026-01-01" } }
```

```json
// POST /recurring-expenses/:id/confirm
// Request:  { "occurrenceDate": "2026-11-15" }
// Response: { "purchaseId": "uuid-compra" }   // queda ligada al recurrente
```

La compra se crea con tipo `REGULAR`, categoría del recurrente (si tiene), fecha
`actualDate` (hoy si la ocurrencia es futura) y el monto `actualAmount` si se
envió; el cargo `PURCHASE` aumenta la deuda de la tarjeta. Auditoría:
`recurring_expense.confirmed` apunta a `Purchase` en este caso.

## 5. Compatibilidad

- Los recurrentes existentes conservan `paymentMethod = CASH_ACCOUNT` y su cuenta.
- El motor de recomendaciones, la proyección y el dashboard no cambian: para el
  contexto financiero una compra recurrente confirmada es deuda de tarjeta (hoy)
  y el gasto programado sigue proyectándose como salida de efectivo hasta confirmarse.

## 6. Migración

`20261006120000_recurring_expense_credit_card` (SQLite y MySQL vía
`npm run mysql:sql`): `cashAccountId` nullable, columna `creditCardId` + FK,
único `(recurringExpenseId, occurrenceDate)` en `Purchase`.
