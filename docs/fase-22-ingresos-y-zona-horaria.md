# Fase 22 — Edición de ingresos con categoría y zona horaria validada

## 1. Objetivo

Dos correcciones de robustez detectadas al revisar la lógica del backend:

1. `PATCH /income/sources/:id` respondía **500** al actualizar una fuente que
   tenía categoría: Prisma no acepta mezclar el campo directo
   (`cashAccountId`) con la relación (`category: { connect }`) en la misma
   actualización.
2. La configuración aceptaba cualquier texto como `timezone`. Una zona
   inválida (`America/Mexico City`, `No/Existe`) hacía fallar `Intl` en cada
   petición que resuelve "hoy" (`ClockService.today`): toda la cuenta
   respondía 500, incluidos flujo de efectivo, dashboard y recomendaciones.

## 2. Cambios

| Archivo | Cambio |
|---|---|
| `modules/income/income.service.ts` | `updateSource` manda `categoryId` directo (sin `connect`) |
| `modules/income/repositories/income.repository.ts` | El input de actualización usa `IncomeSourceUncheckedUpdateInput` |
| `domain/shared/local-date.ts` | Nuevos `isValidTimeZone` y `DEFAULT_TIME_ZONE`; `todayInTimeZone` cae a la zona de defecto si la guardada no existe |
| `common/validation/is-time-zone.decorator.ts` | Nuevo validador `@IsTimeZone` |
| `modules/users/dto/update-settings.dto.ts` | `timezone` exige una zona IANA válida → 400 `VALIDATION_ERROR` |

## 3. Pruebas

```powershell
npx.cmd jest test/integration/income.spec.ts test/integration/users-profile.spec.ts test/unit/domain/local-date.spec.ts
```

- `PATCH /income/sources/:id` con `name`, `cashAccountId` y `categoryId` → 200
  y la fuente conserva su categoría.
- `timezone: "America/Mexico City"` y `timezone: "No/Existe"` → 400; una zona
  válida (`America/Tijuana`) → 200.
- Una zona guardada inválida ya no truena: "hoy" se calcula con
  `America/Mexico_City` y se valida la distinción entre zonas IANA y texto
  arbitrario.

## 4. Compatibilidad

- Sin migración de esquema ni cambios en las respuestas existentes.
- Las cuentas con una zona inválida guardada dejan de responder 500 sin
  necesidad de corregirla a mano.
