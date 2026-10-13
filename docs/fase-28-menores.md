# Fase 28 — Menores: cursores, proxy, purga y reversos fechados

## 1. Objetivo

Cierre de la lista de hallazgos menores de la revisión:

1. **Paginación por cursor** (`createdAt` solo): con filas creadas en la misma
   marca de tiempo (muy común en transferencias y ráfagas), la segunda página
   las saltaba y desaparecían de la lista.
2. **`trustProxy: true` fijo**: cualquiera podía falsificar
   `X-Forwarded-For` para evadir los límites por IP o ensuciar la auditoría.
3. **Purga de mantenimiento**: un usuario problemático detenía la purga de
   todos los siguientes.
4. **Reversos de tarjeta fechados hoy**: un pago revertido dejaba su crédito
   en el periodo equivocado; la regla del proyecto es fechar las
   compensaciones en su periodo original.

## 2. Reglas

- Los cursores de todas las colecciones comparan `(createdAt, id)` en el
  mismo orden que la consulta: no se salta ninguna fila.
- `TRUST_PROXY` decide los saltos de confianza de `X-Forwarded-For`: sin
  valor no se confía en ninguno; un número son saltos; una lista son
  direcciones/redes exactas. El compose fija `1` (nginx delante de la API);
  `.env.production.example` lo documenta.
- La purga procesos cada cuenta en su propia transacción con try/catch: si
  una falla se registra y se sigue con las demás (`usersPurged` cuenta solo
  las exitosas).
- El reverso de un movimiento del libro de la tarjeta se fecha en el
  `occurredOn` original (con `allowBackdated`), como las demás
  compensaciones internas.

## 3. Cambios

| Archivo | Cambio |
|---|---|
| `recommendations.service.ts` + 6 repositorios | Cursores por `(createdAt, id)` |
| `fastify-adapter.factory.ts` | `parseTrustProxy` + `TRUST_PROXY` |
| `docker-compose.yml`, `.env.production.example` | `TRUST_PROXY=1` (nginx) |
| `maintenance.service.ts` | Purga tolerante por cuenta |
| `card-ledger.service.ts` | `reverseEntry` usa la fecha original |

## 4. Pruebas

```powershell
npx.cmd jest test/unit/fastify-adapter.spec.ts test/integration/cash-movements.spec.ts test/integration/card-payments.spec.ts test/integration/maintenance.spec.ts --runInBand
```

- `parseTrustProxy` (vacío/false/0, true, número, lista);
- una página con 4 movimientos con la misma marca de tiempo no pierde filas;
- el reverso de un pago del 25 de septiembre queda fechado el 25 de
  septiembre;
- la purga elimina cuentas con datos financieros completos (guardia).

## 5. Compatibilidad

- Sin migración de esquema ni cambios de contrato.
- **Despliegue:** quien sirva la API detrás de un proxy inverso debe fijar
  `TRUST_PROXY` (el compose ya lo hace). Sin proxy, el default es no confiar
  en la cabecera.
