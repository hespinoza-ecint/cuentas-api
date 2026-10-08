# Fase 14 — Eliminar compras con plan (RN-27)

## 1. Objetivo

Poder **borrar del historial** una compra a meses sin intereses (o diferida) que
ya tiene mensualidades pagadas, algo que hasta ahora bloqueaba la cancelación
normal (`422 PLAN_HAS_PAYMENTS`), ajustando lo necesario en la tarjeta **sin
tocar el dinero que ya salió**.

## 2. La operación

**DELETE /purchases/:id** · `{ "reason": "Registrada por error" }`

| Pieza | Qué pasa |
|---|---|
| Libro de la tarjeta | Entrada `REFUND` por el **cargo pendiente** = cargo original de la compra − pagos/anticipos aplicados a sus mensualidades. El saldo baja y se libera crédito |
| Mensualidades pendientes | Se eliminan con el plan: el usuario ya no las debe |
| Pagos y efectivo ya hechos | **No se tocan.** Los movimientos de efectivo quedan como están y los estados de cuenta se recalculan del libro al consultarse |
| Registro | Se borra la compra y, en cascada, su plan y mensualidades. Las asignaciones de pago conservan su monto (solo pierden la liga a la mensualidad eliminada) |
| Auditoría | `purchase.deleted` con el snapshot (monto, meses, revertido, pagado, motivo) |

Casos verificados:

- **Liquidada por completo:** cargo pendiente = 0 → solo se quita del historial;
  el saldo de la tarjeta no cambia.
- **A medias:** se revierte la parte pendiente; lo pagado no se devuelve (ese
  dinero ya se pagó en la vida real).
- **Al corriente** (`firstStatementMonth`): el cargo original fue el principal
  pendiente, así que se revierte exactamente eso (sin recalcular de más).
- **Ya cancelada antes:** el plan `CANCELLED` no se revierte otra vez (cero).

Restricciones:

- Solo compras **con plan** (`MSI` / `DEFERRED_INTEREST`). Las regulares se
  siguen cancelando con `POST /purchases/:id/cancel` → `422 DELETE_REQUIRES_PLAN`.
- Aislamiento por usuario: la compra de otro usuario responde `404`.
- Motivo obligatorio (mismo `ReasonDialog` que el resto de operaciones).

## 3. Cambios

| Archivo | Cambio |
|---|---|
| `dto/purchase.dto.ts` | `DeletePurchaseDto` (motivo obligatorio, 300 máx) |
| `repositories/purchases.repository.ts` | `findRawWithInstallments` (compra + plan + mensualidades) |
| `purchases.service.ts` | `remove()`: fórmula del reverso, `REFUND`, borrado en cascada y auditoría |
| `purchases.controller.ts` | `DELETE /purchases/:id` con `@RequireVerifiedEmail()` |

## 4. Pruebas

`test/integration/purchases.spec.ts` — 4 casos nuevos (`RN-27`):

```powershell
npx.cmd jest test/integration/purchases.spec.ts   # 15 pruebas en total
```

- elimina con pagos y revierte lo pendiente (tarjeta a 0, efectivo pagado intacto,
  cortes siguen respondiendo);
- liquidada: no toca el saldo;
- al corriente: revierte exactamente el principal pendiente;
- regulares rechazadas (422) y aislamiento entre usuarios (404).

## 5. Compatibilidad

- **Sin migración de esquema**: no se agregaron tablas ni columnas.
- `docs/openapi.json` y `docs/openapi-3.1.json` regenerados y embebidos en
  `documentacion-tecnica-backend.md`.
- El frontend usa `DELETE /purchases/{id}` desde la pantalla de Compras (ver
  `cuentas-web/docs/fase-14-eliminar-compras.md`).
