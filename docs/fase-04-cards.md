# Fase 4 — Tarjetas de crédito

**Estado:** completada

## 1. Objetivo

Gestionar tarjetas de crédito: alta con saldo inicial, ciclos de corte y fecha límite configurables, estados de cuenta materializados desde el libro de la tarjeta, conciliación contra el banco, pagos con aplicación al corte (y al saldo revolvente) y cálculo del crédito disponible. Es la base del motor de recomendaciones.

## 2. Decisiones técnicas

| Tema | Decisión |
|---|---|
| Fuente de verdad | `CardLedgerEntry` es un libro de solo inserción; `currentBalance` y `availableCredit` son caché con `balanceVersion` |
| Única puerta de escritura | `CardLedgerService` crea cargos/abonos y actualiza la caché en la misma transacción |
| RN-12: corte | Día fijo del mes; si no existe, se usa el último día. **Nunca se ajusta por días inhábiles** |
| RN-13: fecha límite | `DAYS_AFTER_CUT` (default 20) o `FIXED_DAY`; se ajusta al día hábil **anterior** (configurable: PREVIOUS/NEXT/NONE) con festivos MX_BANKING |
| RN-14: compra del día del corte | `sameDayCutIncluded` (default true) define si entra en ese corte |
| Estados de cuenta | Se materializan de forma perezosa (`sync`) para todos los cortes ya ocurridos desde el primer movimiento; los montos se recalculan desde el libro |
| RN-15: conciliación | `POST /cards/:id/reconcile` compara el saldo reportado y registra un ajuste auditado |
| RN-16 | El pago mínimo lo puede reportar el usuario; si no, se estima al 1.25% del saldo al corte |
| RN-17 | El pago para no generar intereses se calcula (= saldo al corte en esta fase) y el usuario puede sobrescribirlo |
| RN-23 | El pago se aplica a los cortes exigibles del más antiguo al más reciente; el excedente va al saldo revolvente |
| `PaymentAllocations` | Registran el destino de cada pago (`STATEMENT` o `REVOLVING`); `installmentId` queda reservado para MSI en la Fase 5 |
| Reversos | Un pago se revierte una sola vez: restaura efectivo, saldo de tarjeta y montos de los cortes |
| Crédito disponible | `creditLimit − currentBalance` (RN-18 se completa en la Fase 5 al descontar MSI) |
| Fechas | Sin movimientos futuros; límite de días hacia atrás según la configuración del usuario |
| Seguridad | Mutaciones con correo verificado; aislamiento por usuario (404 para tarjetas ajenas) |

## 3. Estructura creada

```
src/domain/cards/card-cycle.ts              RN-12, RN-13, RN-14 y estados del corte
src/modules/card-ledger/                    libro de la tarjeta (cargos/abonos y caché)
src/modules/ledger/financial-date.policy.ts política de fechas compartida
src/modules/cards/                          CRUD, conciliación, estados de cuenta y ciclo actual
src/modules/card-payments/                  pagos, asignaciones y reversos
prisma/migrations/20261002175156_credit_cards_statements_payments/
```

## 4. Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET/POST | `/api/v1/cards` | Lista y crea tarjetas (con saldo inicial opcional) |
| GET/PATCH/DELETE | `/api/v1/cards/:id` | Detalle, edición y borrado lógico (solo sin saldo) |
| POST | `/api/v1/cards/:id/reconcile` | Conciliación contra el saldo reportado |
| GET | `/api/v1/cards/:id/ledger` | Libro de la tarjeta con filtros y cursor |
| GET | `/api/v1/cards/:id/statements` | Estados de cuenta (materializa los cortes pasados) |
| GET | `/api/v1/cards/:id/statements/current` | Ciclo abierto: próximo corte y fecha límite |
| GET | `/api/v1/cards/:id/statements/:statementId` | Detalle con asignaciones de pago |
| PATCH | `/api/v1/cards/:id/statements/:statementId` | Montos reportados por el banco |
| GET/POST | `/api/v1/card-payments` | Lista y registra pagos |
| GET | `/api/v1/card-payments/:id` | Detalle con asignaciones |
| POST | `/api/v1/card-payments/:id/reverse` | Reverso del pago |

## 5. Migración

`20261002175156_credit_cards_statements_payments` crea: `CreditCard`, `CardLedgerEntry`, `CardStatement`, `CardPayment` y `PaymentAllocation`.

## 6. Pruebas

| Archivo | Tipo | Qué valida |
|---|---|---|
| `card-cycle.spec.ts` | Unitaria | RN-12 (meses de 28 a 31 días y bisiestos), RN-13 (día fijo y días después del corte, fines de semana y festivos), RN-14, estados del corte |
| `cards.spec.ts` | Integración | Alta con saldo inicial, validaciones, límite mínimo, conciliación, borrado, verificación de correo y aislamiento |
| `card-statements.spec.ts` | Integración | Materialización de cortes pasados, fechas límite hábiles, estados OVERDUE/CLOSED, ciclo abierto y montos reportados |
| `card-payments.spec.ts` | Integración | Pago total (corte PAID y crédito liberado), pago parcial con reverso, saldo revolvente sin cortes, pagos inválidos y aislamiento |

**Total del proyecto: 29 suites, 128 pruebas en verde.**

## 7. Validación end-to-end ejecutada

```
TARJETA ok: saldo=500000 disponible=1500000
CORTES ok: 1 corte(s); estado=CLOSED corte=2026-09-22 limite=2026-10-12
CICLO ok: proximo corte=2026-10-22 vence=2026-11-11
PAGO ok: APPLIED asignaciones={"targetType":"STATEMENT","amount":500000}
TRAS PAGO: tarjeta=0 disponible=2000000 efectivo=500000 corte=PAID
TRAS REVERSO: tarjeta=500000 disponible=1500000
DOCS ok: 10 rutas de tarjetas documentadas
```

## 8. Criterios de aceptación

- [x] CRUD de tarjetas con límite, tasas, anualidad y configuración de corte/pago.
- [x] RN-12 verificado en meses de 28, 29, 30 y 31 días.
- [x] RN-13 verificado en fin de semana y festivo (día hábil anterior).
- [x] RN-14 configurable por tarjeta.
- [x] Estados de cuenta coherentes con el libro y fechas límite hábiles.
- [x] Conciliación que deja evidencia (ajuste auditado).
- [x] Pagos con asignación a cortes (RN-23) y reverso único.
- [x] Crédito disponible actualizado en cada operación.
- [x] Sin movimientos futuros; límite de días hacia atrás.
- [x] Aislamiento entre usuarios y correo verificado en mutaciones.
- [x] 128 pruebas en verde y validación real end-to-end.

## 9. Notas

- **Compras:** aún no existen como entidad; se registran en la Fase 5 (regulares, MSI y diferidas). Hoy la tarjeta se alimenta de saldo inicial, conciliaciones y pagos.
- **Pago para no generar intereses:** en esta fase equivale al saldo al corte; la Fase 5 lo refina separando cargos del periodo y mensualidades exigibles.
- **Estados OPEN:** el ciclo abierto se expone en `/statements/current`; no se persiste hasta que ocurre el corte.
- **Intereses:** el cálculo estimado de intereses (RN-22) se implementa en la Fase 5 junto con las mensualidades.
- **Siguiente fase:** Compras y mensualidades (MSI y diferidas con intereses).
