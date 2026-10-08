# Fase 14 — Eliminar compras con plan (RN-27)

## 1. Objetivo

Poder **borrar del historial** una compra —a meses, diferida o regular— que ya
tiene mensualidades pagadas (antes bloqueadas con `422 PLAN_HAS_PAYMENTS`) o que
simplemente se quiere quitar, ajustando lo necesario en la tarjeta **sin tocar
el dinero que ya salió**.

## 2. La operación

**DELETE /purchases/:id** · `{ "reason": "Registrada por error" }`

| Pieza | Qué pasa |
|---|---|
| Libro de la tarjeta | Entrada `REFUND` por el **cargo vivo** de la compra (ver fórmula por tipo). El saldo baja y se libera crédito |
| Mensualidades pendientes | Se eliminan con el plan: el usuario ya no las debe |
| Pagos y efectivo ya hechos | **No se tocan.** Los movimientos de efectivo quedan como están y los estados de cuenta se recalculan del libro al consultarse |
| Registro | Se borra la compra y, en cascada, su plan y mensualidades. Las asignaciones de pago conservan su monto (solo pierden la liga a la mensualidad eliminada) |
| Auditoría | `purchase.deleted` con el snapshot (monto, meses, revertido, pagado, motivo) |

Fórmula del reverso:

- **Con plan (MSI/diferida):** `cargo original − pagos y anticipos aplicados`.
  Si el plan ya estaba cancelado, no hay doble reverso.
- **Regular:** los pagos se aplican a **cortes completos**, no a compras
  individuales, así que se revierte `min(monto, deuda viva de la tarjeta)`.
  Nunca genera saldo a favor: una compra ya pagada solo desaparece del historial.
- **Cancelada o devuelta antes:** `0` (la cancelación previa ya revirtió el cargo).

**El ajuste se fecha en el periodo original del cargo**, no hoy: así los cortes
ya cerrados que incluían la compra se recalculan al consultarlos y dejan de
exigir el pago. Es una compensación interna, por eso puede quedar antes del
límite de días hacia atrás (`allowBackdated` en el libro de la tarjeta); nunca
en el futuro. En las compras regulares, además, la devolución **resta de los
cargos del periodo** del corte (`statements.service`), porque su cargo original
vive ahí y no en las mensualidades.

Casos verificados:

- **Liquidada por completo:** cargo pendiente = 0 → solo se quita del historial;
  el saldo de la tarjeta no cambia.
- **A medias:** se revierte la parte pendiente; lo pagado no se devuelve (ese
  dinero ya se pagó en la vida real).
- **Al corriente** (`firstStatementMonth`): el cargo original fue el principal
  pendiente, así que se revierte exactamente eso (sin recalcular de más).
- **Regular sin pagar:** se revierte el monto completo.
- **Regular ya pagada:** `refundedPrincipal = 0`, el saldo no se mueve.

Restricciones:

- Motivo obligatorio (mismo `ReasonDialog` que el resto de operaciones).
- Aislamiento por usuario: la compra de otro usuario responde `404`.

## 3. Cambios

| Archivo | Cambio |
|---|---|
| `dto/purchase.dto.ts` | `DeletePurchaseDto` (motivo obligatorio, 300 máx) |
| `repositories/purchases.repository.ts` | `findRawWithInstallments` (compra + plan + mensualidades) |
| `purchases.service.ts` | `remove()`: fórmula del reverso por tipo, `REFUND`, borrado en cascada y auditoría |
| `purchases.controller.ts` | `DELETE /purchases/:id` con `@RequireVerifiedEmail()` |

## 4. Pruebas

`test/integration/purchases.spec.ts` — 9 casos `RN-27`:

```powershell
npx.cmd jest test/integration/purchases.spec.ts   # 20 pruebas en total
```

- MSI con pagos: revierte lo pendiente (tarjeta a 0, efectivo pagado intacto,
  cortes siguen respondiendo);
- MSI liquidada: no toca el saldo;
- MSI al corriente: revierte exactamente el principal pendiente;
- regular sin pagar: revierte el cargo vivo;
- regular ya pagada: `refundedPrincipal = 0` (sin saldo a favor);
- **compra regular dentro de un corte ya cerrado: el corte recalcula
  `statementBalance`, `cycleCharges` y `noInterestPaymentCalc` a 0**;
- **compra MSI dentro de un corte ya cerrado: el corte recalcula igual**;
- **el ajuste no depende del límite de días hacia atrás** (compensación interna);
- aislamiento entre usuarios (404).

## 5. Compatibilidad

- **Sin migración de esquema**: no se agregaron tablas ni columnas.
- `docs/openapi.json` y `docs/openapi-3.1.json` regenerados y embebidos en
  `documentacion-tecnica-backend.md`.
- El frontend usa `DELETE /purchases/{id}` desde la pantalla de Compras (ver
  `cuentas-web/docs/fase-14-eliminar-compras.md`).
