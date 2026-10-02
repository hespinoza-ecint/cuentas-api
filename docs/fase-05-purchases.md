# Fase 5 — Compras y mensualidades

**Estado:** completada

## 1. Objetivo

Registrar compras con tarjeta en sus tres modalidades (regular, meses sin intereses y diferida con intereses), generar calendarios de mensualidades exactos, abonar mensualidades con los pagos del corte y permitir pagos anticipados, parciales y la liquidación de un plan.

## 2. Decisiones técnicas

| Tema | Decisión |
|---|---|
| Tipos | `REGULAR`, `MSI` y `DEFERRED_INTEREST`; MSI no admite tasa y la diferida la exige |
| Efecto en el crédito | RN-18: el monto completo ocupa crédito disponible desde la compra y se libera con los pagos |
| RN-19 | La primera mensualidad pertenece al corte que incluye la compra (respeta `sameDayCutIncluded`); el residuo de centavos va en la última |
| RN-20 | Amortización francesa (cuota fija sobre saldo insoluto) con IVA del 16% sobre intereses; comisión `NONE`, `UPFRONT` o `PRORATED` |
| Redondeo | Todo en centavos; la última mensualidad cierra exactamente el principal; invariante verificado: `suma(cuotas) = principal + intereses + IVA (+ comisión)` |
| RN-17 refinado | `pago para no generar intereses` = cargos regulares del periodo + mensualidades exigibles pendientes + saldo anterior no cubierto |
| Facturación | Al materializar un corte, sus mensualidades pasan a `BILLED` y quedan ligadas al `CardStatement` |
| Aplicación de pagos | RN-23: primero mensualidades exigibles del corte, luego cargos regulares, luego saldo revolvente; todo con `PaymentAllocation` (`INSTALLMENT` / `STATEMENT` / `REVOLVING`) |
| RN-21 anticipos | Pagan las siguientes mensualidades en orden (reduce plazo). `REDUCE_PAYMENT` (recalcular mensualidad) queda para una fase posterior y responde 422 explicativo |
| Liquidación | Cuando todas las mensualidades quedan `PAID`, el plan pasa a `PAID_OFF` y la compra a `PAID` |
| RN-26 cancelaciones | Solo si ninguna mensualidad tiene pagos: movimiento `REFUND` por el total; plan y mensualidades pasan a `CANCELLED` |
| Fase 6 | `Purchase.recommendationId` queda reservado para ligar la compra con la recomendación |

## 3. Estructura creada

```
src/domain/installments/amortization.ts      MSI y francesa con residuos exactos
src/modules/installments/                    estado de planes (global; usado por pagos y anticipos)
src/modules/purchases/                       compras, planes, anticipos y cancelaciones
prisma/migrations/20261002182037_purchases_installments/
prisma/migrations/20261002182152_card_payment_plan_link/
```

## 4. Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET/POST | `/api/v1/purchases` | Lista y registra compras (regular, MSI o diferida) |
| GET | `/api/v1/purchases/:id` | Detalle con plan y mensualidades |
| POST | `/api/v1/purchases/:id/cancel` | Cancela o devuelve una compra sin pagos |
| GET | `/api/v1/installment-plans/:id` | Plan con mensualidades y estado |
| POST | `/api/v1/installment-plans/:id/prepay` | Pago anticipado o liquidación |

## 5. Pruebas

| Archivo | Tipo | Qué valida |
|---|---|---|
| `amortization.spec.ts` | Unitaria | Residuos de centavos en la última cuota, suma exacta de capital, IVA sobre intereses, comisiones UPFRONT/PRORATED, tasa cero, parámetros inválidos |
| `purchases.spec.ts` | Integración | Compra regular, MSI con corte correcto y mensualidad exigible, diferida con intereses e IVA, validaciones por tipo, cancelación sin/con pagos, anticipos y liquidación, aislamiento |

**Total del proyecto: 31 suites, 144 pruebas en verde.** Las pruebas de la Fase 4 siguen pasando con la nueva fórmula del pago para no generar intereses.

## 6. Validación end-to-end ejecutada

```
MSI ok: cuotas=3 suma=100000 interes=0 primeraCuota=33333
CORTE ok: corte=2026-08-23 pagoSinIntereses=33333 cargosRegulares=0
ANTICIPO ok: liquidado=False pendiente=66667 primeraEstado=PAID
DIFERIDA ok: interes=8633 iva=1381 sumaCapital=120000 sumaTotal=130014 esperado=130014
CANCELACION ok: estado=CANCELLED plan=CANCELLED
SALDO TARJETA: 66667 (esperado 66667)
DOCS ok: 5 rutas de compras documentadas
```

## 7. Criterios de aceptación

- [x] Compra regular descuenta el crédito y aparece en el libro de la tarjeta.
- [x] MSI con primera mensualidad en el corte de la compra y suma exacta del principal.
- [x] Diferida con amortización francesa, IVA del 16% y suma exacta `principal + intereses + IVA`.
- [x] Residuos de centavos siempre en la última mensualidad.
- [x] Los pagos del corte abonan primero las mensualidades exigibles (RN-23).
- [x] Pagos parciales, anticipados y liquidación con estados coherentes (`Billed`, `PartiallyPaid`, `Paid`, `PaidOff`).
- [x] Cancelación/devolución sin pagos con reverso completo; bloqueo si ya hay pagos.
- [x] Aislamiento por usuario y correo verificado en mutaciones.
- [x] 144 pruebas en verde y validación real end-to-end.

## 8. Notas

- **Pago para no generar intereses:** ahora es la suma de cargos regulares + mensualidades pendientes del corte + saldo anterior no cubierto. El saldo total al corte sigue expuesto en `statementBalance`.
- **REDUCE_PAYMENT:** la reducción de mensualidad tras un anticipo no está disponible; el sistema reduce plazo en todos los casos y lo informa con un error claro.
- **Intereses moratorios (RN-22):** el cálculo estimado de intereses por no pagar el total se implementará junto con la proyección de la Fase 6.
- **Anualidad (RN-24):** se proyectará como cargo futuro en la Fase 6.
- **Siguiente fase:** Motor de recomendaciones (proyección de flujo de efectivo, reglas configuradas, puntaje y explicaciones).
