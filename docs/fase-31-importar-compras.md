# Fase 31 — Importar compras desde Excel (RN-31)

## 1. Objetivo

Capturar un estado de cuenta completo (decenas de compras) sin alta manual: la
web lee el `.xlsx` en el navegador, muestra una vista previa con avisos y la API
crea todo en una sola transacción contra una tarjeta elegida.

## 2. Reglas

- **Dos endpoints JSON** (el archivo nunca viaja a la API):
  - `POST /purchases/import/preview` (200, solo lectura): por fila devuelve
    `duplicateOfId`, `statementPaid` y `dateIssue`.
  - `POST /purchases/import` (201, `@Idempotent`): crea 1 a 500 filas como
    compras REGULAR en una sola transacción.
- **Duplicados por cantidad:** una compra existente de la tarjeta con la misma
  fecha, monto y descripción normalizada (sin mayúsculas ni espacios de más)
  marca cuando mucho una fila; las repeticiones legítimas dentro del archivo se
  importan.
- **Corte pagado (RN-30):** la vista previa sincroniza los cortes una vez y
  avisa las filas cuyo corte ya tiene pagos; el import no las filtra (es aviso,
  decide el usuario).
- **Fechas (RN-06/RN-07):** la vista previa avisa `FUTURE_DATE_NOT_ALLOWED` y
  `BACKDATE_LIMIT_EXCEEDED`; el import valida todo el lote antes de escribir y,
  si una fila falla, responde 422 con `reason` y `rowIndex` sin crear nada.
- **Cada fila** es una compra REGULAR con su cargo en el libro fechado ese día
  (cae en su corte) y auditoría `purchase.created` con `origin: "IMPORT"`.
- **Sin categoría** (la categoría se asigna después por compra).

## 3. Cambios

| Archivo | Cambio |
|---|---|
| `purchase.dto.ts` | `ImportPurchasesDto` / `ImportPurchaseRowDto` (1..500 filas) |
| `financial-date.policy.ts` | `context` y `allowedIssue` (versión sin excepción de la política de fechas) |
| `purchases.service.ts` | `previewImport`, `importPurchases` y `createRegularInTx` (rama regular compartida con `create`) |
| `purchases.controller.ts` | `POST /purchases/import/preview` y `POST /purchases/import` |

## 4. Pruebas

```powershell
npx.cmd jest test/integration/purchases-import.spec.ts
```

- duplicados por cantidad con descripciones que difieren en mayúsculas/espacios;
- corte pagado vs. ciclo abierto; fechas futura, fuera de límite y en el límite;
- import atómico: los cargos caen en el corte de su fecha; una fila inválida no
  crea nada (422 con `rowIndex`); tarjeta inactiva; tarjeta ajena (404);
- 501 filas responde 400; misma `Idempotency-Key` no duplica.

## 5. Compatibilidad

- Sin migración de esquema.
- Endpoints nuevos; nada existente cambia (`create` conserva su comportamiento
  tras el refactor de la rama regular).
