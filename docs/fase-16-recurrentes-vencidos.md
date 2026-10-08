# Fase 16 — Ocurrencias vencidas de gastos recurrentes

## 1. El problema

La lista de ocurrencias por confirmar generaba fechas **desde hoy**, así que una
ocurrencia que caía antes de hoy (por ejemplo, el cargo del día 1 cuando ya es
día 8) **no aparecía para confirmarla**: quedaba fuera de la app y nunca llegaba
al corte. Además, la PWA confirmaba siempre con `actualDate: hoy`, de modo que
una ocurrencia vencida se registraba con la fecha de hoy y aterrizaba en un
**corte futuro** en lugar del que le correspondía.

## 2. Lo que se corrigió

| Pieza | Antes | Ahora |
|---|---|---|
| `GET /recurring-expenses/upcoming` | Solo fechas ≥ hoy | Incluye las **vencidas recientes** (hasta `backdateLimitDays` hacia atrás) con `daysUntil < 0`, más las próximas dentro del horizonte |
| Confirmación | La PWA enviaba `actualDate: hoy` | Ya no lo envía: el backend fecha las vencidas en su día (`occurrenceDate`) y las futuras confirmadas antes de tiempo, en hoy |
| Corte | La compra vencida quedaba en un corte futuro | Queda en el **corte que le toca**: el cargo entra con la fecha real, el corte se recalcula y pide su pago ahí |
| UI | El texto "· vencida" era inalcanzable | La lista muestra las vencidas con "· vencida" listas para confirmar |

Notas:

- La ventana de vencidas usa el `backdateLimitDays` del usuario (default 60):
  así coinciden lo que se puede listar y lo que la política de fechas permite
  registrar.
- `actualDate` sigue siendo opcional: si se envía, se respeta.

## 3. Pruebas

`test/integration/recurring-expenses.spec.ts` — caso nuevo:

```powershell
npx.cmd jest test/integration/recurring-expenses.spec.ts   # 6 pruebas
```

- la ocurrencia vencida aparece en `upcoming` con `daysUntil < 0`;
- al confirmarla sin `actualDate`, la compra queda con la fecha de la ocurrencia;
- el corte ya cerrado la incluye (`cycleCharges` y `noInterestPaymentCalc`), o
  sea que no se va a un corte futuro;
- deja de aparecer como pendiente.

## 4. Compatibilidad

- Sin migración de esquema y sin cambios de contrato (el `actualDate` ya era
  opcional).
- El frontend correspondiente: `cuentas-web/docs/fase-16-recurrentes-vencidos.md`.
