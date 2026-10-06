# Fase 11 — Restablecimiento de datos por usuario y exportación completa

## 1. Objetivo

Dar al usuario una forma segura de **empezar de cero**: borrar todo lo que la app
lleva por él sin eliminar su cuenta, y completar la **exportación** para que pueda
respaldar todo antes de hacerlo.

## 2. Reset de datos (`POST /users/me/reset`)

Dos alcances con `scope`:

- `ALL` (default): borra todo lo que la app lleva por el usuario.
- `CARDS`: borra **solo el dominio de tarjetas** (tarjetas, libro, cortes, pagos,
  asignaciones, compras, planes y mensualidades) y conserva efectivo, ingresos,
  gastos, recurrentes, auditoría y los movimientos de efectivo de los pagos.

Requiere la **contraseña actual** (`400 INVALID_PASSWORD` si no coincide) y corre
en una sola transacción. Con `ALL` borra, en orden hijos → padres (para respetar
las FK `Restrict`):

| Grupo | Tablas |
|---|---|
| Tarjetas | `PaymentAllocation`, `Installment`, `CardPayment`, `InstallmentPlan`, `CardLedgerEntry`, `CardStatement`, `CreditCard` |
| Efectivo | `Expense`, `CashMovement`, `CashAccount` |
| Ingresos | `IncomeTransaction`, `IncomeSchedule`, `IncomeSource` |
| Programados | `RecurringExpense` |
| Compras | `Purchase` |
| Recomendaciones | `RecommendationHistory`, `UserRecommendationRuleOverride` |
| Catálogos propios | `Category` (solo `isSystem = false`) |
| Operación | `IdempotencyRecord`, `AuditLog` (del usuario y como actor) |

**Conserva:** la cuenta (`User`), la contraseña, las sesiones activas, la
verificación de correo y las preferencias (`UserSettings`). Las categorías del
sistema y las reglas globales de recomendación no se tocan.

Respuesta:

```json
{ "message": "Datos restablecidos. Tu cuenta, sesion y preferencias siguen intactas.",
  "deleted": { "cashAccounts": 1, "cashMovements": 1, "creditCards": 1,
               "purchases": 1, "installmentPlans": 1, "installments": 3,
               "recurringExpenses": 1, "incomeSources": 1, "incomeSchedules": 1,
               "categories": 1, "auditLogs": 14, "...": 0 } }
```

Al final se escribe un registro de auditoría `user.data.reset` con el alcance y los
conteos. Con `ALL` es el único rastro que permanece (la auditoría previa se
elimina); con `CARDS` la auditoría se conserva.

### 2.1 Solo tarjetas (`scope: CARDS`)

```json
{ "password": "Password1234", "scope": "CARDS" }
// → { "message": "Tarjetas restablecidas. Tu efectivo, ingresos, gastos y preferencias siguen intactos.",
//     "scope": "CARDS",
//     "deleted": { "creditCards": 1, "purchases": 1, "installmentPlans": 1, "installments": 3,
//                  "cardPayments": 1, "paymentAllocations": 1, "cardLedgerEntries": 2, "cardStatements": 0 } }
```

Los movimientos de efectivo de los pagos de tarjeta **se conservan**: el dinero sí
salió de la cuenta. Si quieres deshacer también esa parte, usa `scope: ALL`.

En la PWA: **Cuenta y datos → Restablecer tarjetas** (contraseña + confirmación) o
**Restablecer datos** para el alcance completo. La caché de TanStack Query se
invalida por completo para que todo se recargue. Se recomienda descargar la
exportación antes.

## 3. Exportación completa (`GET /users/me/export`)

`schemaVersion: 2`. Ahora `financial` incluye las 18 colecciones del usuario:

```
cashAccounts, cashMovements, categories, incomeSources, incomeSchedules,
incomeTransactions, recurringExpenses, expenses, creditCards, cardLedgerEntries,
cardStatements, cardPayments, paymentAllocations, purchases, installmentPlans,
installments, recommendationHistory, ruleOverrides
```

Se mantiene `Content-Disposition: attachment` y el archivo no incluye
`passwordHash` ni tokens de refresh.

## 4. Pruebas

| Archivo | Qué valida |
|---|---|
| `users-reset.spec.ts` | Contraseña incorrecta no borra nada; reset borra todas las colecciones (conteos), deja listados vacíos, conserva sesión/preferencias/categorías del sistema, aísla a otros usuarios y permite empezar de cero; `scope: CARDS` borra solo tarjetas y conserva efectivo/ingresos/recurrentes y los movimientos de efectivo de los pagos; reset sin datos deja conteos en cero |
| `users-lifecycle.spec.ts` | La exportación incluye perfil, configuración, `schemaVersion: 2` y las colecciones financieras (cuenta, movimiento, categoría), sin `passwordHash` |

Frontend: pruebas del diálogo de reset en ambos alcances (`ALL` y `CARDS`), con
contraseña + confirmación + aviso.

## 5. Notas

- El reset **no** cierra la sesión ni revoca tokens de verificación.
- Si la cuenta está en `PENDING_DELETION`, la PWA oculta la tarjeta de reset
  (el endpoint tampoco está permitido en ese estado).
- No hay migración de base de datos: es una operación sobre tablas existentes.
