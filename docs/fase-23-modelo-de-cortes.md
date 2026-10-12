# Fase 23 — Modelo de cortes: pago para no generar intereses y anticipos (RN-17/RN-23)

## 1. Objetivo

Cuatro correcciones del modelo de dinero detectadas al revisar la lógica:

1. Un **pago parcial podía marcar un corte como PAGADO debiendo dinero**: la
   mensualidad se exigía neta de lo pagado y ese mismo pago volvía a contar en
   `paidAmount` (doble descuento).
2. Los **pagos hechos durante el ciclo abierto** (antes de que exista el
   corte) quedaban "revolventes" sin dueño: el corte siguiente los ignoraba y
   la app volvía a pedir ese dinero.
3. El **flujo y el dashboard contaban la deuda dos veces**: sumaban todos los
   cortes no pagados, aunque el más reciente ya incluye el saldo anterior.
4. Las **compras del ciclo abierto no aparecían** en la proyección hasta que
   el corte llegaba.

## 2. Reglas

- **RN-17**: pago para no generar intereses = cargos regulares del periodo +
  mensualidades exigidas por su **monto completo** + saldo anterior no
  cubierto. `paidAmount` sigue siendo la suma de asignaciones vigentes;
  PAGADO ⟺ pagado ≥ exigible. Los créditos negativos del periodo (devolución
  de compras eliminadas, cancelaciones y ajustes negativos) restan.
- **RN-23**: al materializar cada corte se **adoptan los anticipos huérfanos**
  del ciclo abierto: primero las asignaciones ligadas a mensualidades
  facturadas en ese corte y luego el crédito genérico contra lo exigible, del
  corte más antiguo al más nuevo. Si el crédito excede lo exigible, la
  asignación se divide y el sobrante queda para el siguiente corte. Las
  mensualidades pagadas parcialmente por anticipos también se facturan.
- **RN-14**: con `sameDayCutIncluded = false` el periodo empieza en el corte
  anterior: una compra el día del corte entra al corte siguiente (consistente
  con `cutDateForPurchase`).
- **Proyección**: una sola deuda por tarjeta (último corte no pagado, en su
  fecha límite) más una obligación por el **corte próximo a cerrar**: cargos
  del ciclo abierto + mensualidades que se facturarán − anticipos disponibles.
  Las tarjetas inactivas con deuda siguen contando.
- **RN-27**: al eliminar una compra con plan solo cuentan los pagos vigentes
  (los revertidos ya no reducen lo devuelto).
- El saldo de la tarjeta se actualiza de forma **atómica** (`increment` /
  `decrement`): dos movimientos simultáneos ya no se pisan.
- Cambiar `cutDay` queda **bloqueado** (`422 CUT_DAY_LOCKED`) cuando la
  tarjeta ya tiene cortes o mensualidades: recalcular todo el historial queda
  para una fase posterior.

## 3. Cambios

| Archivo | Cambio |
|---|---|
| `domain/cards/card-cycle.ts` | `statementPeriodStart` recibe `sameDayCutIncluded` (RN-14) |
| `modules/cards/statements.service.ts` | `sync` transaccional: exigible bruto, facturación de mensualidades parciales, `adoptOrphanAllocations`, `periodCharges` compartido; nuevo `projectedNextCut` |
| `modules/cards/repositories/cards.repository.ts` | `findStatement`/`sumAllocations` aceptan transacción |
| `modules/cashflow/cashflow-context.service.ts` | Una deuda por tarjeta + obligación del ciclo abierto; tarjetas inactivas con deuda |
| `modules/dashboard/dashboard.service.ts` | `pendingPayment` = último corte no pagado |
| `modules/cards/cards.service.ts` | Bloqueo de `cutDay` con historial (`CUT_DAY_LOCKED`) |
| `modules/card-ledger/card-ledger.service.ts` | Saldo y crédito con `increment`/`decrement` |
| `modules/purchases/purchases.service.ts` | RN-27: pagos revertidos no cuentan al eliminar un plan |

## 4. Pruebas

```powershell
npx.cmd jest test/integration/card-statements-model.spec.ts test/unit/domain/card-cycle.spec.ts --runInBand
```

`test/integration/card-statements-model.spec.ts` (con `ClockService`
sustituido para simular el tiempo):

- pago parcial de un corte con mensualidad: sigue debiendo y no queda PAGADO;
- anticipo del ciclo abierto: se abona al corte que llega y el dashboard
  muestra la deuda una sola vez;
- proyección del ciclo abierto: una sola obligación, con anticipo restado y
  sin duplicar la mensualidad del corte próximo;
- `sameDayCutIncluded = false`: la compra del día de corte entra al siguiente;
- eliminar un plan con un pago revertido devuelve el principal completo;
- cambiar `cutDay` con historial responde 422; una tarjeta limpia sí puede.

## 5. Compatibilidad

- Sin migración de esquema ni cambios de contrato (mismos campos y tipos).
- Los anticipos huérfanos existentes se adoptan solos en el siguiente `sync`
  (cualquier lectura de cortes, flujo o dashboard).
- Los importes visibles se recalculan al consultar: un corte que aparecía
  PAGADO puede volver a mostrar saldo pendiente; es el estado real.
- Pendiente para una fase posterior: registrar intereses/IVA de planes
  diferidos en el libro (H4) y la línea de tiempo única del recomendador
  (fase C del plan de mejoras).
