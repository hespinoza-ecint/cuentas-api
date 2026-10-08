# Fase 15 — Reiniciar y eliminar tarjetas con todo su historial (RN-28)

## 1. Objetivo

Dos operaciones por tarjeta:

- **Reiniciar**: borrar todo el historial de una tarjeta y dejarla **como
  nueva** (saldo $0 y crédito completo), conservando la tarjeta.
- **Eliminar**: borrar el historial **y la tarjeta**, con un borrado real (el
  alias queda libre para volver a usarlo).

Antes, eliminar una tarjeta solo era un borrado lógico y exigía saldo 0
(`422 CARD_WITH_BALANCE`); las operaciones masivas vivían en
`POST /users/me/reset` con `scope: CARDS`. Ahora también hay control por tarjeta.

## 2. Las operaciones

**POST /cards/:id/reset** · `{ "reason": "Tarjeta de pruebas" }`

**DELETE /cards/:id** · `{ "reason": "Ya no la uso" }`

| Pieza | Reiniciar | Eliminar |
|---|---|---|
| Libro, cortes, pagos, asignaciones, compras, planes y mensualidades | Se borran | Se borran |
| Tarjeta | Sigue (saldo 0, crédito completo, `balanceVersion`++) | Se borra (real) |
| Gastos recurrentes de la tarjeta | Se conservan (la tarjeta sigue viva) | Se borran con ella |
| Movimientos de efectivo de pagos hechos | **No se tocan** (ese dinero ya salió) | **No se tocan** |
| Auditoría | `credit_card.reset` con conteos | `credit_card.deleted` con conteos |

Ambas responden con el resumen de lo borrado:

```json
{ "message": "...", "deleted": { "purchases": 1, "installmentPlans": 1,
  "installments": 3, "cardPayments": 1, "paymentAllocations": 1,
  "cardLedgerEntries": 2, "cardStatements": 1, "recurringExpenses": 0 } }
```

Notas:

- El borrado del dominio respeta el orden hijos → padres de las FK `Restrict`
  (asignaciones → mensualidades → pagos → planes → compras → libro → cortes).
- Al eliminar una tarjeta, sus recurrentes (`FK Restrict`) se van con ella;
  no tiene sentido un recurrente `CREDIT_CARD` sin tarjeta.
- Las recomendaciones que apuntaban a la tarjeta quedan con `recommendedCardId`
  en nulo (`SetNull`).
- El reset por usuario `scope: CARDS` ahora también elimina los recurrentes
  ligados a tarjeta (antes fallaba con la FK `Restrict` si existían).

## 3. Cambios

| Archivo | Cambio |
|---|---|
| `dto/card.dto.ts` | `CardPurgeDto` (motivo obligatorio) |
| `cards.service.ts` | `reset()`, `remove()` nuevo y `purgeDomain()` compartido |
| `cards.controller.ts` | `POST /cards/:id/reset`; `DELETE /cards/:id` con motivo y resumen |
| `users.service.ts` | El reset `CARDS` borra antes los recurrentes ligados a tarjeta |

## 4. Pruebas

`test/integration/cards.spec.ts` — 3 casos `RN-28`:

```powershell
npx.cmd jest test/integration/cards.spec.ts   # 9 pruebas
```

- reinicia una tarjeta con historial: conteos, saldo $0, crédito completo, la
  tarjeta/recurrente/efectivo siguen y el dominio queda vacío;
- elimina la tarjeta con todo: incluye el recurrente ligado, los demás quedan,
  el alias se puede reutilizar;
- aislamiento entre usuarios (`404`).

`test/integration/users-reset.spec.ts`: el caso `CARDS` ahora crea también un
recurrente ligado a tarjeta y verifica que se elimina sin romper la FK.

## 5. Compatibilidad

- **Sin migración de esquema**.
- `DELETE /cards/:id` cambia de `204` sin cuerpo a `200` con motivo y resumen.
- OpenAPI regenerado y embebido; RN-28 documentada.
- El frontend usa ambas rutas desde Tarjetas y el detalle de tarjeta (ver
  `cuentas-web/docs/fase-15-reiniciar-eliminar-tarjeta.md`).
