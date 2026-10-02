# Fase 6 — Motor de recomendaciones

**Estado:** completada

## 1. Objetivo

Recomendar qué tarjeta usar para una compra (o pagar con efectivo) con reglas configurables, proyección de flujo de efectivo, puntaje 0–100, explicaciones, advertencias, alternativas ordenadas, historial reproducible y el caso explícito de "ninguna opción".

## 2. Decisiones técnicas

| Tema | Decisión |
|---|---|
| Motor puro | `src/domain/recommendation`: sin NestJS, Prisma ni reloj; recibe el contexto armado y devuelve el resultado |
| Candidatas | Tarjetas activas del usuario + opción "pagar con efectivo"; en MSI se puede limitar a tarjetas elegibles |
| Simulación | Corte donde entra la compra (RN-14), fecha límite (RN-13), días de financiamiento, calendario de pagos (MSI o francesa) y costo de intereses |
| Proyección | Saldo gastable + ingresos esperados (con factor y gracia de la Fase 3) − gastos recurrentes − pagos pendientes de tarjetas (cortes vencidos + mensualidades no facturadas) − la compra simulada |
| Reglas eliminatorias | `CARD_ACTIVE`, `CREDIT_AVAILABLE`, `MSI_ELIGIBLE` y `CASHFLOW_NON_NEGATIVE` |
| Reglas de puntaje | `NO_INTEREST` 35, `CASH_BUFFER` 25, `FINANCING_DAYS` 25 (objetivo 45 días) y `UTILIZATION` 15; normalizadas al 100% |
| Niveles | Excelente ≥ 80, Buena 60–79, Aceptable 40–59, No recomendable < 40 |
| Reglas en base | 8 reglas sembradas; el admin ajusta pesos/parámetros globales; cada usuario puede sobrescribir, desactivar o restablecer |
| Explicaciones | Cada regla devuelve `{ code, message, params }`; hay motivos y advertencias por opción |
| Sugerencias | Si nada es elegible (`NONE`), se sugiere la fecha en que el flujo alcanzaría, tarjetas a liberar o promociones no elegibles |
| Historial | Snapshots de la solicitud, del contexto, de las reglas y del resultado para reproducir la decisión; la compra puede ligarse con `recommendationId` |
| Disclaimer | Toda respuesta incluye el aviso de que es una estimación y no asesoría financiera |

## 3. Estructura creada

```
src/domain/recommendation/types.ts     contratos del motor
src/domain/recommendation/engine.ts    algoritmo de eliminacion, puntaje y explicaciones
src/modules/recommendations/           servicio (contexto + historial), reglas y admin
prisma/seed/data/recommendation-rules.ts
prisma/migrations/20261002185502_recommendation_engine/
```

## 4. Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/v1/recommendations` | Genera una recomendación (con historial) |
| GET | `/api/v1/recommendations` | Historial paginado |
| GET | `/api/v1/recommendations/:id` | Detalle con snapshots |
| GET | `/api/v1/recommendation-rules` | Reglas resueltas (globales + overrides del usuario) |
| PUT | `/api/v1/recommendation-rules/:code/override` | Sobrescribe peso, parámetros o estado |
| DELETE | `/api/v1/recommendation-rules/:code/override` | Restablece la regla global |
| PATCH | `/api/v1/admin/recommendation-rules/:code` | Ajuste global (solo ADMIN) |

Ejemplo de respuesta: opción recomendada, alternativas ordenadas, corte, fecha de pago, días de financiamiento, flujo mínimo y su fecha, costo de intereses, utilización resultante, motivos, advertencias, sugerencias y disclaimer.

## 5. Migración

`20261002185502_recommendation_engine` crea `RecommendationRule`, `UserRecommendationRuleOverride` y `RecommendationHistory`, y liga `Purchase.recommendationId` al historial.

## 6. Pruebas

| Archivo | Tipo | Qué valida |
|---|---|---|
| `recommendation-engine.spec.ts` | Unitaria | Fechas y días de financiamiento, elegibilidad MSI, crédito insuficiente, flujo negativo con sugerencia de fecha, preferencia por efectivo en compras con intereses, advertencia de utilización, regla deshabilitada, pesos personalizados y orden de alternativas |
| `recommendations.spec.ts` | Integración | Recomendación real con explicaciones e historial, ligar la compra, caso NONE con sugerencias, listado y override de reglas, permisos de admin |

**Total del proyecto: 33 suites, 157 pruebas en verde.**

## 7. Validación end-to-end ejecutada

```
RECOMENDACION ok: CARD (Oro) puntaje=93 nivel=EXCELLENT vence=2026-11-04 dias=33
MOTIVOS: Flujo minimo proyectado: $17500.00 / 33 dias de financiamiento
MSI ok: CARD (Oro) dias=182 advertencias=0
ALTERNATIVA ok: CASH cuando ninguna tarjeta pasa las reglas
HISTORIAL ok: 3 recomendaciones guardadas
REGLAS ok: 8 (NO_INTEREST=35, CASH_BUFFER=25, FINANCING_DAYS=25, UTILIZATION=15)
OVERRIDE ok: regla deshabilitada y marcada como sobrescrita
DOCS ok: 5 rutas de recomendaciones documentadas
```

## 8. Criterios de aceptación

- [x] Motor independiente de controladores y base de datos, cubierto por pruebas unitarias.
- [x] Corte y fecha de pago por tarjeta según RN-13 y RN-14.
- [x] Días de financiamiento, calendario de pagos y costo de intereses.
- [x] Proyección de flujo con ingresos, gastos, obligaciones y la compra simulada.
- [x] Reglas eliminatorias y de puntaje configurables con pesos.
- [x] Explicaciones con motivos y advertencias; alternativas ordenadas.
- [x] Caso "ninguna tarjeta" con motivos y sugerencias.
- [x] Historial reproducible con snapshots y liga con la compra.
- [x] Sobrescritura por usuario y ajuste global solo para admin.
- [x] 157 pruebas en verde y validación real end-to-end.

## 9. Notas

- **Horizonte:** las proyecciones usan hasta 365 días; los planes MSI más largos se proyectan con los ingresos disponibles en ese rango (limitación documentada).
- **Intereses moratorios (RN-22)** y **anualidad (RN-24)**: se registran como cargos/obligaciones cuando se materializan; su proyección automática queda para la Fase 7.
- **REDUCE_PAYMENT** de anticipos sigue pendiente y responde 422 explicativo.
- **Valores por defecto editables:** `minCashBuffer`, `maxUtilizationBps` y el factor de ingresos variables provienen de la configuración del usuario (Fase 2).
- **Siguiente fase:** Pruebas y preparación para producción (E2E, seguridad, respaldos, MySQL y documentación final).
