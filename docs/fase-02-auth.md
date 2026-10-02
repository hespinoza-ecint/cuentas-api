# Fase 2 — Usuarios y autenticación

**Estado:** completada

## 1. Objetivo

Implementar el ciclo de vida completo del usuario: registro, verificación de correo, inicio y cierre de sesión, refresh con rotación, recuperación de contraseña, perfil, configuración financiera, eliminación con periodo de gracia, exportación de datos y aislamiento estricto entre usuarios. Además, dejar los guards de roles y de correo verificado para las fases siguientes.

## 2. Decisiones técnicas

| Tema | Decisión |
|---|---|
| Hash de contraseñas | Argon2id con parámetros OWASP (19 MiB, 2 iteraciones) vía `@node-rs/argon2` (binarios precompilados, sin compilación nativa) |
| Access token | JWT de 15 minutos con `sub`, `sid` y `role` (`@nestjs/jwt`) |
| Refresh token | 256 bits aleatorios; se guarda solo el hash SHA-256 en `Session` |
| Rotación | Cada refresh crea una sesión nueva y revoca la anterior; reutilizar un token revoca toda la familia |
| Validación de sesión | El guard valida la firma del JWT **y** que la sesión siga activa en la base; cerrar sesión invalida el access token de inmediato |
| PWA (WEB) | Refresh en cookie `httpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`, `Secure` en producción; se valida `Origin` en cada refresh |
| App nativa (NATIVE) | Refresh en el cuerpo de la respuesta |
| Verificación de correo | Token de un solo uso (24 h), guardado como hash; reenviar invalida el anterior |
| Recuperación de contraseña | Token de un solo uso (30 min); al usarlo se revocan todas las sesiones |
| Bloqueo por intentos | 5 intentos fallidos → 15 minutos de bloqueo (configurable) |
| Límite de peticiones | 5/min en rutas `/auth/*` (configurable; elevado en pruebas) |
| Correo | Adaptador `MailService`; en desarrollo el enlace se escribe en el log |
| Recursos ajenos | Responder 404 (no 403) para no revelar que existen |
| Registro | No inicia sesión automáticamente; el usuario hace login después de verificar |

## 3. Estructura creada

```
src/common/auth/                     decoradores: @Public, @Roles, @CurrentUser,
                                     @RequireVerifiedEmail, @AllowPendingDeletion
src/common/http/cookies.ts           parseo y serialización de cookies (sin dependencias)
src/common/http/request-meta.ts      ip / userAgent / requestId para auditoría
src/infrastructure/mail/             MailService abstracto + adaptador de consola
src/modules/audit/                   AuditService (escritura transaccional)
src/modules/auth/
│  ├─ auth.controller.ts             registro, login, refresh, logout, sesiones,
│  │                                 verificación, recuperación
│  ├─ auth.service.ts                reglas de negocio de sesiones y tokens
│  ├─ auth.constants.ts              cookie, tipos de token, throttle de auth
│  ├─ dto/                           8 DTOs de entrada + respuestas
│  ├─ guards/                        JwtAuthGuard, RolesGuard, VerifiedEmailGuard
│  ├─ repositories/                  SessionsRepository, VerificationTokensRepository
│  └─ services/                      PasswordService (argon2id), TokenService (SHA-256)
src/modules/users/
│  ├─ users.controller.ts            perfil, configuración, eliminación, exportación
│  ├─ users.service.ts
│  ├─ repositories/users.repository.ts
│  └─ dto/                           perfil, cambio de contraseña, settings, borrado
prisma/migrations/20261002161815_sessions_and_verification_tokens/
test/helpers/test-mail.service.ts    captura de tokens en pruebas
test/helpers/api.ts                  helpers de registro, verificación y login
```

## 4. Endpoints

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Registro (no inicia sesión) | Pública |
| POST | `/api/v1/auth/login` | Login WEB (cookie) o NATIVE (refresh en cuerpo) | Pública |
| POST | `/api/v1/auth/refresh` | Rota el refresh token | Pública |
| POST | `/api/v1/auth/logout` | Cierra la sesión actual (204) | Bearer |
| POST | `/api/v1/auth/logout-all` | Cierra todas las sesiones (204) | Bearer |
| GET | `/api/v1/auth/sessions` | Lista sesiones activas propias | Bearer |
| DELETE | `/api/v1/auth/sessions/:id` | Revoca una sesión propia (204) | Bearer |
| POST | `/api/v1/auth/verify-email` | Verifica el correo con token | Pública |
| POST | `/api/v1/auth/resend-verification` | Reenvía verificación (202 genérico) | Pública |
| POST | `/api/v1/auth/forgot-password` | Solicita restablecimiento (202 genérico) | Pública |
| POST | `/api/v1/auth/reset-password` | Restablece con token | Pública |
| GET | `/api/v1/users/me` | Perfil | Bearer |
| PATCH | `/api/v1/users/me` | Actualiza nombre/apellidos | Bearer |
| POST | `/api/v1/users/me/change-password` | Cambia contraseña (cierra las demás sesiones) | Bearer |
| GET | `/api/v1/users/me/settings` | Configuración financiera | Bearer |
| PATCH | `/api/v1/users/me/settings` | Actualiza configuración | Bearer |
| POST | `/api/v1/users/me/delete` | Solicita eliminación (30 días de gracia) | Bearer |
| POST | `/api/v1/users/me/cancel-deletion` | Cancela la eliminación | Bearer (pendiente) |
| GET | `/api/v1/users/me/export` | Exporta los datos en JSON | Bearer (pendiente) |

## 5. Migración

`20261002161815_sessions_and_verification_tokens` crea:

- `Session`: sesiones con `familyId`, `tokenHash` único, `clientType`, `expiresAt`, `revokedAt`, `revokedReason`, `replacedBySessionId`.
- `VerificationToken`: tokens de un solo uso (`EMAIL_VERIFY`, `PASSWORD_RESET`) con `usedAt`.

## 6. Pruebas

| Archivo | Tipo | Qué valida |
|---|---|---|
| `auth-register.spec.ts` | Integración | Registro, normalización de correo, hash argon2id, settings por defecto, auditoría, duplicados |
| `auth-verify-email.spec.ts` | Integración | Verificación, token de un solo uso, reenvío invalida el anterior, 202 genérico |
| `auth-login.spec.ts` | Integración | Flujos NATIVE y WEB, cookie httpOnly, credenciales inválidas, bloqueo tras 5 intentos |
| `auth-refresh-logout.spec.ts` | Integración | Rotación, detección de reutilización, cookie + Origin, logout, logout-all, sesiones y aislamiento |
| `auth-password-reset.spec.ts` | Integración | Restablecimiento, revocación de sesiones, token de un solo uso, 202 genérico |
| `users-profile.spec.ts` | Integración | Auth obligatoria, perfil, whitelist, settings y validación, cambio de contraseña |
| `users-lifecycle.spec.ts` | Integración | Eliminación con contraseña, bloqueo, cancelación, exportación sin hash |
| `roles.guard.spec.ts` | Unitaria | 403 por rol insuficiente, 401 sin usuario |
| `token.service.spec.ts` | Unitaria | Aleatoriedad y hash SHA-256 |
| `password.service.spec.ts` | Unitaria | Argon2id y hash corrupto |

**Total del proyecto: 17 suites, 60 pruebas en verde.**

## 7. Cómo validar

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run test
npm.cmd run start:dev
```

Prueba manual rápida:

1. `POST /api/v1/auth/register` con `{ email, password, firstName, lastName }`.
2. El enlace de verificación aparece en el log de desarrollo (adaptador de consola).
3. `POST /api/v1/auth/verify-email` con el token del enlace.
4. `POST /api/v1/auth/login` con `clientType: "NATIVE"` → `accessToken` + `refreshToken`.
5. `GET /api/v1/users/me` con `Authorization: Bearer <accessToken>`.
6. `GET /api/docs` muestra los 17 paths de auth y users.

Validación end-to-end ejecutada con el build de producción: registro → verificación → login → perfil → sesiones → Swagger, todo correcto.

## 8. Criterios de aceptación

- [x] Registro con Argon2id, configuración por defecto y auditoría.
- [x] Verificación de correo con token de un solo uso (24 h).
- [x] Login WEB/NATIVE con access token de 15 min y refresh de 30 días.
- [x] Refresh con rotación y revocación de la familia al detectar reutilización.
- [x] Logout y logout-all con revocación inmediata (el access token deja de servir).
- [x] Recuperación de contraseña de un solo uso que revoca todas las sesiones.
- [x] Bloqueo temporal tras 5 intentos fallidos.
- [x] Perfil y configuración financiera con validación y whitelist.
- [x] Eliminación con contraseña, periodo de gracia, cancelación y exportación.
- [x] Aislamiento: nunca se accede a recursos de otro usuario (404).
- [x] Guards de roles y correo verificado listos para las fases siguientes.
- [x] Auditoría de registro, login, bloqueo, verificación, cambios de contraseña, perfil, settings y eliminación.
- [x] 60 pruebas en verde y validación real end-to-end.

## 9. Notas y decisiones

- **Registro sin auto-login:** el usuario inicia sesión después de verificar el correo; evita sesiones de cuentas sin verificar.
- **Sesión en cada petición:** el guard consulta la sesión y el estado del usuario en la base. Cuesta una consulta indexada por petición (aceptable para el volumen previsto) y permite revocación inmediata. Si el rendimiento lo exigiera, se puede añadir caché con invalidación.
- **Refresh estricto:** al rotar, el access token anterior queda inválido de inmediato (su `sid` ya no está activo). Los clientes deben reemplazar el access token tras cada refresh.
- **Cambio de contraseña:** revoca todas las sesiones excepto la actual. **Restablecimiento por token:** revoca todas, incluida la actual.
- **Eliminación:** la cuenta queda en `PENDING_DELETION`; el login sigue permitido, todas las rutas se bloquean con 403 salvo cancelar, exportar y cerrar sesión. La purga definitiva a los 30 días se implementará como tarea programada en la Fase 7.
- **Cookies sin dependencia:** se descartó `@fastify/cookie` porque su carga dinámica de ESM rompe Jest; las utilidades propias cubren leer, escribir y borrar una cookie httpOnly.
- **Correo:** `MailService` es un adaptador intercambiable; en desarrollo los enlaces salen en el log. Nunca se registran tokens en producción.
- **Fase 3 pendiente:** aplicar `@RequireVerifiedEmail()` a las operaciones financieras y planear la purga de sesiones/tokens expirados.
