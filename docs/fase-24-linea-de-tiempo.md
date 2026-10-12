# Fase 24 — Línea de tiempo única: horizonte, recurrentes con tarjeta y anualidad

## 1. Objetivo

Tres correcciones del horizonte de la proyección (flujo, dashboard y motor de
recomendaciones):

1. El motor cortaba los **ingresos** al horizonte, pero las **obligaciones
   entraban completas** (planes de hasta 48 meses): el flujo mínimo salía
   falso-negativo y se descartaban tarjetas/opciones sin razón. El dashboard
   sumaba años de mensualidades en "próximos pagos (30 días)".
2. Los **recurrentes pagados con tarjeta** se proyectaban como salida de
   efectivo el día del cargo; el efectivo sale al pagar el corte que lo
   incluye.
3. La **anualidad** se proyectaba como salida directa el día 1 del mes
   configurado, solo la siguiente y sin pasar por el corte.

## 2. Reglas

- **Ventana por opción (motor)**: cada opción proyecta hasta el fin de su
  plan — `max(último pago del plan, hoy + projectionMinDays)` — y los eventos
  posteriores no cuentan para el mínimo. La comparación entre opciones queda
  consistente (sin obligaciones lejanas que ensucien a todas).
- **Tope de horizonte (`buildBase`)**: los cortes, el ciclo abierto, las
  mensualidades, los recurrentes con tarjeta y las anualidades se recortan a
  `[hoy, hoy + N días]`, igual que los ingresos y gastos de efectivo. El
  dashboard ("30 días") y la ventana de la proyección dicen la verdad.
- **Recurrente con tarjeta (RN-25)**: el evento se fecha en la fecha límite
  del corte que incluye el cargo (RN-13), con el nombre del recurrente. La
  ocurrencia agrega `paymentMethod` y `creditCardId` a su JSON.
- **Anualidad (RN-24)**: se proyecta una por año dentro de la ventana,
  pagadera en la fecha límite del corte que la cobra; se omite la que ya
  venció (su corte ya está materializado).
- El `sync` de cortes **no escribe filas cuando nada cambió** (menos I/O en
  cada lectura de flujo/dashboard/recomendaciones).

## 3. Cambios

| Archivo | Cambio |
|---|---|
| `domain/recommendation/engine.ts` | `windowEndFor`: recorte de eventos al fin del plan (proyección y sugerencia base) |
| `modules/cashflow/cashflow-context.service.ts` | Tope `horizonEnd` en todas las obligaciones; recurrentes con tarjeta convertidos a la fecha del corte; anualidad multi-año vía corte |
| `modules/cashflow/cashflow.module.ts` | Importa `HolidaysModule` (fechas límite con festivos) |
| `modules/expenses/recurring-expenses.service.ts` | `RecurringOccurrence` expone `paymentMethod` y `creditCardId` |
| `modules/cards/statements.service.ts` | El sync no actualiza estados de cuenta sin cambios |

## 4. Pruebas

```powershell
npx.cmd jest test/unit/domain/recommendation-engine.spec.ts test/integration/dashboard.spec.ts test/integration/cashflow-horizon.spec.ts --runInBand
```

- el motor ignora obligaciones posteriores al fin del plan (mínimo real, sin
  falsos negativos);
- el dashboard limita "próximos pagos" a los 30 días (un plan de 24 meses no
  suma 2.4 millones);
- un recurrente con tarjeta del 14 de octubre se proyecta el 4 de noviembre
  (pago del corte), no el día del cargo;
- la anualidad se proyecta una vez por año dentro de la ventana, en la fecha
  del corte que la cobra.

## 5. Compatibilidad

- Sin migración de esquema. Contrato con dos campos nuevos en el JSON de
  ocurrencias de recurrentes (`paymentMethod`, `creditCardId`), solo
  aditivos.
- La proyección puede cambiar resultados de recomendaciones previas: eran
  falsos negativos por el horizonte.
- Riesgo aceptado: si el usuario registra la anualidad a mano en el libro
  (por ejemplo vía conciliación), la proyección puede mostrarla además como
  anualidad; la app no publica la anualidad sola.
