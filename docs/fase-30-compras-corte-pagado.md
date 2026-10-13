# Fase 30 — Compras de un corte pagado: no se cancelan ni se eliminan (RN-30)

## 1. Objetivo

Si el corte de una compra ya recibió un pago (total o parcial), la compra deja
de poder modificarse: cancelarla o eliminarla respondía 200 y recalculaba un
corte sobre el que ya se había pagado dinero. Ahora la API lo bloquea con 422
y, al revertir el pago, la compra queda libre otra vez.

## 2. Reglas

- **Compra regular:** el corte se deriva de la fecha de su cargo con
  `cutDateForPurchase`. Si el corte todavía no ocurre (ciclo abierto) no hay
  bloqueo; si ya ocurrió, la API sincroniza los cortes (materializa el corte y
  adopta los anticipos del ciclo abierto) y bloquea cuando `paidAmount > 0`
  (`422 PURCHASE_STATEMENT_PAID`).
- **Compra con plan (MSI o diferida):** se bloquea con cualquier pago aplicado
  a una mensualidad, sea de un pago de tarjeta o de un anticipo
  (`422 PLAN_HAS_PAYMENTS`, el mismo motivo que ya usaba cancelar). Las
  mensualidades marcadas como pagadas fuera de la app (planes "al corriente")
  no cuentan.
- **Pago revertido:** las asignaciones de un pago revertido dejan de contar, así
  que cancelar/eliminar vuelve a funcionar.
- **Cortes sin pagos:** eliminar una compra de un corte cerrado sin pagos sigue
  permitido y lo recalcula (RN-27).
- **Pista para la interfaz:** las respuestas de compras incluyen
  `lockedReason` (`null`, `"STATEMENT_PAID"` o `"PLAN_HAS_PAYMENTS"`). Es de
  solo lectura y se calcula con el último estado guardado de cortes y
  asignaciones; la API confirma el bloqueo al ejecutar.

## 3. Cambios

| Archivo | Cambio |
|---|---|
| `purchases.service.ts` | `assertPurchaseUnlocked` (RN-30) en `cancel` y `remove`; `withLockedReason` para el listado y el detalle; tipos `PurchaseView` y `PurchaseLockedReason` |
| `purchases.module.ts` | Sin cambios: `StatementsService` ya se exporta desde `CardsModule` |

## 4. Pruebas

```powershell
npx.cmd jest test/integration/purchases.spec.ts
npx.cmd jest test/integration/card-statements-model.spec.ts
```

- compra MSI con anticipo, liquidada y diferida con pago: eliminar responde 422
  (`PLAN_HAS_PAYMENTS`) y responde igual al cancelar cuando aplica;
- compra regular de un corte pagado: cancelar y eliminar responden 422
  (`PURCHASE_STATEMENT_PAID`); con pago parcial también;
- revertir el pago libera la compra y el ajuste del borrado vuelve a calcularse;
- en el ciclo abierto se puede eliminar (el anticipo es huérfano); al cerrar el
  corte, el sincronizado lo adopta y el intento responde 422;
- un plan "al corriente" (mensualidades pagadas fuera de la app) sigue sin
  bloquearse;
- `lockedReason` se expone en listado y detalle.

## 5. Compatibilidad

- Sin migración de esquema.
- Cambio de contrato: `DELETE /purchases/:id` y `POST /purchases/:id/cancel`
  pueden responder 422; las respuestas de compras agregan `lockedReason`.
  Actualizar el cliente antes de desplegar (la web de esta fase ya lo usa).
- El bloqueo aplica también a compras canceladas previamente: para borrarlas del
  historial hay que revertir el pago del corte o esperar a que se revierta.
