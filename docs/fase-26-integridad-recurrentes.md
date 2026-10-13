# Fase 26 — Integridad de movimientos y gastos recurrentes

## 1. Objetivo

Cinco correcciones de integridad detectadas en la revisión:

1. El **reverso genérico de movimientos** permitía revertir el movimiento de un
   gasto, un ingreso, un pago de tarjeta o una transferencia: la entidad de
   origen quedaba desincronizada (el gasto seguía PAID, el ingreso confirmado,
   el pago aplicado) y solo una pierna de la transferencia se deshacía.
2. **`useHolidays` se guardaba pero nunca se leía**: las fechas seguían
   moviéndose por festivos aunque el usuario lo desactivara.
3. **Confirmar u omitir no validaba la fecha**: un cliente podía registrar la
   fecha cruda (p. ej. el 16) mientras la proyección mostraba la ajustada (el
   14), dejando la ocurrencia real pendiente y contada dos veces.
4. **No se podía omitir una ocurrencia de un gasto recurrente** (los ingresos
   sí tenían `skip`): una ocurrencia impagada seguía restándose del flujo.
5. Un **gasto revertido dejaba su ocurrencia marcada para siempre**: no se
   podía volver a confirmar (el índice único y la búsqueda no filtraban).

Además: **eliminar una cuenta de efectivo** referenciada por ingresos o
recurrentes activos dejaba proyecciones rotas (confirmar fallaba con
`ACCOUNT_NOT_FOUND`).

## 2. Reglas

- Solo se revierten genéricamente los **ajustes** (y sus reversos); los
  movimientos con origen (`gasto`, `ingreso`, `pago`, `anticipo`,
  `transferencia`) responden `422 MOVEMENT_HAS_SOURCE` y se corrigen desde su
  propio reverso.
- `useHolidays = false`: el ajuste por día inhábil considera solo fines de
  semana (los festivos del calendario no mueven la fecha).
- Confirmar u omitir exige que la fecha sea una **ocurrencia real** del
  calendario con el ajuste vigente: `422 INVALID_OCCURRENCE_DATE`.
- Nuevo `POST /recurring-expenses/:id/skip`: registra la ocurrencia en
  `RecurringExpenseSkip`, deja de proyectarse y no crea gasto. Confirmarla
  después responde `409 OCCURRENCE_ALREADY_SKIPPED`.
- Un gasto revertido **libera su ocurrencia** (`occurrenceDate` a null): el
  recurrente vuelve a proyectarse y se puede confirmar de nuevo.
- Eliminar una cuenta con ingresos o recurrentes activos responde
  `422 ACCOUNT_IN_USE`.

## 3. Cambios

| Archivo | Cambio |
|---|---|
| `prisma/schema.prisma` + migración `20261013024823_recurring_expense_skips` | Modelo `RecurringExpenseSkip` (único por recurrente + fecha) |
| `prisma/mysql/init.sql` | Regenerado con la tabla nueva |
| `modules/cash-movements/cash-movements.service.ts` | Guarda `MOVEMENT_HAS_SOURCE` |
| `modules/income/income.service.ts` | `useHolidays` + `assertOccurrenceDate` en confirm/skip |
| `modules/expenses/recurring-expenses.service.ts` | `useHolidays`, `assertOccurrenceDate`, `skip`, filtro de omitidas y conflicto al confirmar |
| `modules/expenses/expenses.service.ts` | El reverso libera `occurrenceDate` |
| `modules/expenses/recurring-expenses.controller.ts` + dto | Ruta `POST :id/skip` con `@Idempotent()` |
| `modules/cash-accounts/cash-accounts.service.ts` | `ACCOUNT_IN_USE` |

## 4. Pruebas

```powershell
npx.cmd jest test/integration/cash-movements.spec.ts test/integration/cash-accounts.spec.ts test/integration/income.spec.ts test/integration/recurring-expenses.spec.ts --runInBand
```

- revertir el movimiento de un gasto → 422 y saldo intacto;
- eliminar cuentas en uso → 422; cuenta limpia → 204;
- `useHolidays=false` no mueve el 2 de noviembre (festivo bancario);
- fechas que no son ocurrencia → 422 al confirmar y al omitir;
- omitir una ocurrencia: deja de proyectarse, doble skip → 409 y confirmar →
  409 `OCCURRENCE_ALREADY_SKIPPED`;
- gasto revertido: la ocurrencia vuelve a proyectarse y se confirma otra vez.

## 5. Compatibilidad

- **Migración requerida** (tabla nueva; SQLite vía migración, MySQL con
  `prisma/mysql/init.sql`).
- Los clientes que enviaban la fecha cruda en confirmaciones deben enviar la
  fecha ajustada que muestra la proyección (la API ya la entrega).
- Sin cambios de contrato en los endpoints existentes; se agrega la ruta
  `skip` de recurrentes.
