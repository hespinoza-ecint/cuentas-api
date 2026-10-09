# Fase 17 — Flujo de efectivo hasta la última mensualidad (RN-29)

> **Actualizado en la fase 18**: el horizonte automático se reemplazó por una
> **ventana de fechas seleccionable** (default 30 días). Ver
> `fase-18-ventana-de-fechas-del-flujo.md`.

## 1. El problema

La gráfica de flujo usaba 60 días por defecto, pero las **obligaciones de
tarjeta no tienen horizonte**: todas las mensualidades programadas (por
ejemplo, una compra a 24 MSI) entraban a la proyección aunque estuvieran a dos
años. Los ingresos y gastos programados, en cambio, solo se generaban dentro
del horizonte de 60 días. Resultado: en la cola de la gráfica el saldo se caía
—mensualidades sin los ingresos que las pagan— y el "mínimo proyectado" quedaba
distorsionado.

## 2. Lo que se corrigió

| Pieza | Antes | Ahora |
|---|---|---|
| Horizonte de `GET /cashflow/projection` sin `days` | 60 días fijos | **Hasta la última obligación programada** (última mensualidad pendiente o próxima anualidad), con mínimo `projectionMinDays` (60) y tope de 5 años |
| Ingresos y gastos programados | Solo dentro de 60 días | Se generan hasta el horizonte efectivo (los mismos datos que el motor) |
| `days` explícito | — | Sigue mandando: si el cliente lo pide, se respeta exactamente (1–365) |
| PWA (dashboard) | Enviaba `days=60` | No envía `days`: la gráfica muestra "Próximos N días" según el horizonte real |

Con esto, una compra a 24 MSI se ve completa: cada mensualidad con su ingreso
correspondiente y un mínimo/final que sí reflejan el flujo real.

## 3. Detalles de implementación

- `CashflowContextService.horizonDaysFor(userId, requestedDays?)`:
  - toma el máximo entre `projectionMinDays`, `MAX(dueDate)` de las
    mensualidades no pagadas/canceladas y la próxima anualidad (RN-24);
  - topa a `MAX_HORIZON_DAYS = 1825` (5 años: cubre planes de hasta 48 meses).
- Los generadores de ocurrencias escalan su límite con el horizonte
  (`pendingIncomeGraceDays + days + 30` para ingresos; `backdateLimitDays +
  days + 30` para recurrentes, tope 2000) y `buildBase` pide hasta 1000
  ocurrencias, para que un sueldo semanal no se trunque antes del final.
- El dashboard y el motor de recomendaciones no cambian: ellos pasan su
  horizonte explícito.

## 4. Pruebas

`test/integration/cashflow.spec.ts` — caso `RN-29`:

```powershell
npx.cmd jest test/integration/cashflow.spec.ts   # 5 pruebas
```

- con una compra a 24 MSI y un sueldo mensual, la proyección sin `days` tiene
  `horizonDays` > 365 y ≥ días hasta la última mensualidad;
- la última mensualidad aparece como evento `INSTALLMENT` en su fecha;
- el último ingreso queda a ≤ 31 días del cierre (los ingresos llegan hasta el
  final);
- `?days=30` sigue devolviendo un horizonte de 30.

## 5. Compatibilidad

- Sin migración y sin cambios de contrato salvo el comportamiento por defecto
  del `days` opcional.
- Doc técnica actualizada (RN-29) y guía visual del dashboard
  (`cuentas-web/docs/fase-17-flujo-hasta-ultima-mensualidad.md`).
