# Fase 27 — Intereses e IVA de compras diferidas en el libro (RN-20)

## 1. Objetivo

El libro de la tarjeta solo cargaba el **principal** de un plan diferido,
mientras cada mensualidad exige su **monto completo** (capital + interés + IVA
+ comisión). Consecuencias reales:

- tras pagar mensualidades, el saldo de la tarjeta quedaba **por debajo de la
  deuda real** y podía volverse negativo;
- el crédito disponible se sobrestimaba;
- **liquidar el plan antes de facturar todos los intereses era imposible**
  (`422 PAYMENT_EXCEEDS_BALANCE`, porque el pago topaba con un saldo que no
  incluía esos intereses).

## 2. Reglas

- Al **facturarse** una mensualidad (sync de cortes), el libro recibe:
  - `INTEREST` por el interés de la mensualidad;
  - `FEE` por su IVA más la comisión.
  Ambos con `sourceType = InstallmentPlan`, `sourceId = id de la mensualidad`,
  fechados en el corte y **idempotentes** (una vez por mensualidad).
- **Reconciliación**: cualquier mensualidad facturada —o pagada con la app sin
  haberse facturado (pago adelantado)— recibe sus entradas en el siguiente
  sync; esto también nivela **datos previos**. El historial "al corriente"
  (mensualidades pagadas fuera de la app) **no** se carga.
- Los cargos de mensualidades siguen fuera de los cargos del periodo
  (`periodCharges` los excluye): el **exigible del corte no cambia**.
- El **anticipo** topa con el pendiente del plan (que ya incluye los intereses
  futuros), no con el saldo actual de la tarjeta: liquidar un plan con interés
  futuro vuelve a ser posible.
- **Cancelar o eliminar** un plan revierte todo lo cargado en el libro
  (principal o pendiente "al corriente" + intereses/IVA facturados) menos lo
  ya pagado con la app: nunca queda deuda fantasma.

## 3. Cambios

| Archivo | Cambio |
|---|---|
| `modules/cards/statements.service.ts` | `ensureBillingEntries`: publica intereses/IVA/comisión al facturar (o al detectar un pago adelantado), idempotente por mensualidad |
| `modules/purchases/purchases.service.ts` | El anticipo ya no se limita por el saldo de la tarjeta; cancelar y eliminar suman los intereses facturados (`planInterestCharges`) |

Sin migración de esquema ni cambios de contrato.

## 4. Pruebas

```powershell
npx.cmd jest test/integration/purchases.spec.ts --runInBand
```

- una diferida facturada carga principal + interés + IVA en el libro (y un
  segundo sync no duplica);
- el exigible del corte sigue siendo el total de la mensualidad (sin doble
  conteo);
- liquidar la diferida con intereses futuros sin facturar → `settled` y saldo
  final 0;
- cancelar una diferida con intereses facturados deja la tarjeta en 0;
- eliminar una diferida con un pago aplicado revierte todo y deja la tarjeta
  en 0.

## 5. Compatibilidad

- Los planes existentes se nivelan solos en el siguiente sync (reconciliación
  idempotente); el historial "al corriente" no se altera.
- El anticipo que antes era rechazado por exceder el saldo ahora procede si
  está dentro del pendiente del plan (el único tope es
  `PREPAYMENT_EXCEEDS_PLAN`).
