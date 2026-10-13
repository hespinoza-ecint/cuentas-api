# Fase 25 — Sesión y refresh robustos + idempotencia con reserva

## 1. Objetivo

Endurecer la sesión y la idempotencia ante las fallas detectadas en la
revisión:

1. **Logout sin access token válido**: exigía un access token vigente; con el
   token vencido respondía 401, no limpiaba la cookie y la sesión de 30 días
   seguía viva (se "cerraba sesión" y al recargar volvía). En un teléfono
   compartido esto es serio.
2. **Reuso de refresh**: dos pestañas o dos peticiones con el mismo token
   (carrera normal) revocaban la familia completa y deslogueaban todo.
3. **Límite de refresco**: el refresh compartía el límite de 5/min de
   login/registro, fácil de agotar al reabrir la app.
4. **Idempotencia sin reserva**: dos peticiones concurrentes con la misma
   llave se ejecutaban ambas; la expiración no se respetaba; y varios POST
   financieros no aceptaban la cabecera.

## 2. Reglas

- **Logout idempotente**: no exige access token. Revoca la sesión del refresh
  token (cookie del WEB o `refreshToken` del cuerpo) o, si no lo hay, la del
  access token actual; **siempre** limpia la cookie. Sin credenciales responde
  204.
- **Reuso de refresh con gracia** (`REFRESH_ROTATION_GRACE_MS`, 30 s): un
  token rotado reutilizado dentro de la gracia es una carrera (pestañas) → 401
  `REFRESH_TOKEN_ROTATED` sin revocar la familia. Fuera de la gracia → robo:
  familia completa (`REUSE_DETECTED`) y 401 `REFRESH_TOKEN_REUSED`. Sesiones
  revocadas por otros motivos (logout, cambio de contraseña) → 401 simple.
- **Rotación atómica**: la sesión vieja se revoca solo si seguía vigente; si
  otra petición ganó la carrera, la perdedora recibe 401
  `REFRESH_TOKEN_ROTATED` sin crear sesiones.
- **Límite propio** de `POST /auth/refresh` y `POST /auth/logout`
  (`REFRESH_THROTTLE_*`, 60/min por defecto).
- **Idempotencia con reserva**: antes de ejecutar se inserta el registro en
  `IN_PROGRESS`; el reintento concurrente recibe `409 IDEMPOTENCY_IN_PROGRESS`;
  al terminar pasa a `COMPLETED` con la respuesta (replay con
  `x-idempotent-replay`); si falla, la reserva se libera; un registro vencido
  se elimina y la operación se re-ejecuta.
- La cabecera ahora también aplica a `POST /expenses`,
  `POST /cash-accounts/transfer`, `POST /cards/:id/reconcile` y
  `POST /recurring-expenses/:id/confirm`.

## 3. Cambios

| Archivo | Cambio |
|---|---|
| `prisma/schema.prisma` + migración `20261013013011_idempotency_status` | Columna `status` (`IN_PROGRESS`/`COMPLETED`) en `IdempotencyRecord` |
| `prisma/mysql/init.sql` | Regenerado con la columna (aplicar en producción) |
| `modules/auth/auth.service.ts` | Política de reuso con gracia (`failRevokedSession`) y logout por credenciales |
| `modules/auth/repositories/sessions.repository.ts` | Rotación atómica condicional (`revokedAt: null`) |
| `modules/auth/auth.controller.ts` + `dto/logout.dto.ts` | Logout `@Public` idempotente; throttle propio del refresh |
| `common/idempotency/idempotency.interceptor.ts` | Reserva `IN_PROGRESS`, expiración, liberación en error |
| `modules/expenses|cash-accounts|cards` controllers | `@Idempotent()` en los POST faltantes |

## 4. Pruebas

```powershell
npx.cmd jest test/integration/auth-refresh-logout.spec.ts test/integration/idempotency.spec.ts --runInBand
```

- carrera benigna de rotación (401 `REFRESH_TOKEN_ROTATED`, familia viva);
- reuso tardío (familia revocada, `REFRESH_TOKEN_REUSED`);
- logout con la cookie y sin access token (204 + sesión revocada); logout sin
  credenciales (204);
- reserva en curso (409 `IDEMPOTENCY_IN_PROGRESS`, sin efecto); registro
  vencido re-ejecutado; transferencia/gasto/recurrente con replay idéntico.

## 5. Compatibilidad y despliegue

- **Migración requerida**: la columna `status` (SQLite vía migración; MySQL
  con `prisma/mysql/init.sql`, aplicar a mano en producción). Los registros
  existentes quedan `COMPLETED` por el default.
- El logout deja de exigir Bearer; la cookie sigue siendo `httpOnly` y el
  cuerpo es opcional (contrato documentado con cuerpo obligatorio; el servidor
  tolera la ausencia para clientes previos).
- Config nueva: `REFRESH_THROTTLE_LIMIT`/`REFRESH_THROTTLE_TTL_MS` y
  `REFRESH_ROTATION_GRACE_MS` (con defaults razonables).
