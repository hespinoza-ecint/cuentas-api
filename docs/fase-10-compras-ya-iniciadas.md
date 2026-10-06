# Fase 10 — Compras a meses ya iniciadas (mes del primer corte)

## 1. Objetivo

Permitir registrar compras **MSI o diferidas que ya venían en pagos** antes de usar
la app: se indica el **mes del primer corte** (`firstStatementMonth`) y el plan
queda **al corriente con la fecha actual**, sin capturar meses uno por uno:

- Las mensualidades con fecha límite **ya vencida** se registran como `PAID`.
- La tarjeta solo carga en el libro el **principal pendiente** (no el monto original).
- La mensualidad estimada y la proyección usan la primera mensualidad vigente.

## 2. La regla en detalle

| Concepto | Comportamiento |
|---|---|
| Primer corte | `cutDateForMonth(cutDay, año, mes)` — el corte de la tarjeta dentro del mes elegido (si el día no existe, el último del mes, RN-12). |
| Mensualidad pagada | `dueDate <= hoy` (fecha límite ya cumplida): `status = PAID`, `paidAmount = totalAmount`, `paidAt` en la fecha límite, sin estado de cuenta. |
| Mensualidad vigente | `dueDate > hoy`: `SCHEDULED`, entra al corte que corresponda y se paga con el flujo normal (o un anticipo). |
| Saldo de la tarjeta | Entrada `PURCHASE` por el **principal pendiente** (entrada con `sourceType = InstallmentPlan`, como cualquier MSI). |
| Fecha de la entrada | El corte de la primera mensualidad vigente (si ya ocurrió) o hoy; así el corte donde toca facturarla se materializa al consultar los estados de cuenta. |
| `estimatedMonthlyPayment` | Pago promedio de las mensualidades vigentes (capital + interés + IVA). |
| `amount` de la compra | Monto **original**; `installmentPlan.outstandingPrincipal` es lo pendiente. |
| Proyección / recomendaciones | Solo las mensualidades `SCHEDULED` cuentan como obligación; las `PAID` quedan fuera. |

> "Al corriente" asume que el usuario no debe mensualidades vencidas. Si además
> hubiera un saldo revolvente u otros cargos, se corrigen con una conciliación
> de tarjeta (`POST /cards/:id/reconcile`) como cualquier otro saldo.

## 3. Endpoint

`POST /purchases` con el campo opcional `firstStatementMonth` (`"YYYY-MM"`, solo
`MSI` o `DEFERRED_INTEREST`):

```json
{ "creditCardId": "uuid", "description": "Teléfono", "amount": 600000,
  "purchaseDate": "2026-10-06", "type": "MSI", "months": 6,
  "firstStatementMonth": "2026-06" }
```

Respuesta (fragmento): plan con `firstStatementDate: "2026-06-15"`,
`outstandingPrincipal` igual al principal de las mensualidades vigentes,
`estimatedMonthlyPayment` = promedio de las vigentes y `installments` con las vencidas en
`PAID` y las vigentes en `SCHEDULED`.

Errores:

- `400 START_MONTH_REQUIRES_PLAN` — `firstStatementMonth` en una compra `REGULAR`.
- `422 PLAN_ALREADY_PAID_OFF` — con ese mes el plan ya estaría liquidado.
- `400` de validación si el formato no es `YYYY-MM`.

## 4. Qué no cambia

- Sin `firstStatementMonth`, el comportamiento es el de siempre (primer corte a
  partir de la fecha de compra y todas las mensualidades `SCHEDULED`).
- **Sin migración de base de datos**: solo cambia la lógica de creación.
- Cancelación y anticipos siguen igual; una compra con mensualidades pagadas no
  se puede cancelar (`PLAN_HAS_PAYMENTS`), se corrige con anticipo, ajuste o
  conciliación.

## 5. Pruebas

`test/integration/purchases.spec.ts`:

1. Compra MSI ya iniciada: vencidas `PAID`, vigentes `SCHEDULED`, saldo de la
   tarjeta = principal pendiente, estimada = primera vigente y la proyección de
   flujo solo suma las vigentes.
2. `422 PLAN_ALREADY_PAID_OFF` con un mes que liquida el plan.
3. `400 START_MONTH_REQUIRES_PLAN` en compras regulares y validación de formato.
