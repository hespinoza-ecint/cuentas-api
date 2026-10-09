# Fase 18 — Ventana de fechas en el flujo de efectivo (RN-29)

## 1. Objetivo

En lugar de extender la proyección automáticamente hasta la última obligación
(fase 17), el usuario elige el **rango de fechas** de la gráfica y, por
defecto, se muestran **30 días a partir de hoy**.

## 2. La ventana

`GET /cashflow/projection?from=YYYY-MM-DD&to=YYYY-MM-DD`

| Parámetro | Regla |
|---|---|
| `from` | Default hoy; no puede ser anterior a hoy → `422 RANGE_START_IN_PAST` |
| `to` | Default `from` + 30 días; debe ser posterior → `422 RANGE_END_BEFORE_START` |
| Ventana | Máximo 5 años (planes de hasta 48 MSI con margen) → `422 RANGE_TOO_WIDE` |
| `days` | Compatibilidad: ventana de N días a partir de hoy (1–365) |

Semántica del cálculo:

- El flujo se genera desde hoy hasta `to`, para que lo anterior a `from` pueda
  mover el saldo inicial.
- Los eventos **anteriores a `from`** (por ejemplo, cortes vencidos) se aplican
  al `startingBalance` de la ventana; los **posteriores a `to`** se recortan.
- `minimum`, `finalBalance` y `belowBuffer` se calculan solo con los eventos de
  la ventana.
- La respuesta agrega `from` y `to`; `horizonDays` sigue reportando los días de
  la ventana y `startingBalance` es el saldo al inicio de la ventana.

## 3. Cambios

| Archivo | Cambio |
|---|---|
| `dto/cashflow.dto.ts` | `from`/`to` (`IsLocalDate`) + `days` de compatibilidad |
| `cashflow-context.service.ts` | `resolveWindow()` reemplaza a `horizonDaysFor()` (validaciones y default 30 días) |
| `cashflow.service.ts` | Recorte de eventos a la ventana y saldo inicial ajustado por lo previo |
| `test/integration/cashflow.spec.ts` | Ventana, rango completo, validaciones y saldo previo |

## 4. Pruebas

```powershell
npx.cmd jest test/integration/cashflow.spec.ts   # 7 pruebas
```

- default `from` = hoy y `to` = hoy + 30, puntos dentro de la ventana;
- `days=60` legado sigue funcionando;
- rango explícito hasta la última mensualidad de 24 MSI (evento en su fecha e
  invariante `finalBalance = startingBalance + neto`);
- validaciones: `from` en el pasado, `to` ≤ `from` y ventana > 5 años;
- un ingreso anterior a la ventana suma al saldo inicial y no aparece como
  evento.

## 5. Compatibilidad

- Sin migración de esquema.
- El contrato agrega `from`/`to`; `days` se conserva.
- La fase 17 (horizonte automático) queda reemplazada por esta ventana
  seleccionable.
