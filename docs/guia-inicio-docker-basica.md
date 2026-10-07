# Guía de inicio con Docker (paso a paso, principiantes)

> Para levantar Cuentas sin experiencia previa con Docker: backend y frontend en
> **dos contenedores** del mismo servidor, conectados a tu **MySQL**.
> Al terminar tendrás:
>
> - La **PWA** (frontend) en un puerto que tú eliges, por ejemplo `8456`.
> - La **API** (backend) escuchando solo en local, por ejemplo `31415`.
> - Tu **MySQL** atendiendo a la API (puede usar un puerto no típico, p. ej. `3307`).
>
> Tiempo estimado: 20–30 minutos. Si algo falla, salta a la sección 10.

```
Navegador ──► http://TU_DOMINIO o http://IP:8456     (contenedor web, nginx)
                     │  / → PWA compilada
                     │  /api, /health → proxy interno
                     ▼
              api:3000 (contenedor backend, NO se publica al exterior)
                     │  mysql://usuario:clave@TU_MYSQL:PUERTO/cuentas
                     ▼
              MySQL (tu servidor, puerto típico o no)
```

---

## 1. Antes de empezar

Necesitas:

| Cosa | Comprobar con | Notas |
|---|---|---|
| Docker + compose | `docker --version` y `docker compose version` | Ubuntu: `sudo apt install docker.io docker-compose-v2` |
| Los dos repos | — | `cuentas-api` y `cuentas-web` clonados/copiados como hermanos |
| Acceso a MySQL | `mysql -h TU_MYSQL -P PUERTO -u cuentas -p -e "SELECT 1"` | Desde el servidor donde correrá Docker |
| Un dominio (recomendado) | — | Para HTTPS; también puedes probar con `IP:8456` |

Conceptos mínimos:

- **Contenedor**: una "caja" aislada que contiene el programa (Node, nginx…).
- **Imagen**: la plantilla de la caja; `docker compose build` la construye.
- **Puerto interno**: dentro de la caja, el front usa `80` y la API `3000`.
- **Puerto publicado**: el del servidor que elijas para llegar a la caja
  (ej. `8456 → 80`). Solo el del front debe ser accesible desde Internet.

Estructura esperada:

```
/opt/cuentas/
├─ cuentas-api/     (backend + docker-compose.yml)
└─ cuentas-web/     (frontend; el compose lo toma como ../cuentas-web)
```

## 2. Preparar MySQL (una sola vez)

Conéctate como administrador de MySQL:

```bash
mysql -h TU_MYSQL -P PUERTO_MYSQL -u root -p
```

Crea la base y un usuario **dedicado** que solo pueda entrar desde la IP del
servidor Docker (sustituye `IP_DEL_SERVIDOR_DOCKER` y la contraseña):

```sql
CREATE DATABASE cuentas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'cuentas'@'IP_DEL_SERVIDOR_DOCKER' IDENTIFIED BY 'PON_AQUI_TU_CLAVE_FUERTE';
GRANT ALL PRIVILEGES ON cuentas.* TO 'cuentas'@'IP_DEL_SERVIDOR_DOCKER';

FLUSH PRIVILEGES;
```

> ¿MySQL en un puerto no típico? Perfecto: solo tienes que usar `-P` aquí y
> poner ese puerto en `DATABASE_URL` más adelante.
> ¿MySQL es un servicio público (DuckDNS, etc.)? Restringe el `GRANT` a la IP
> pública del servidor Docker, no a `%`.

Ahora aplica el esquema inicial (crea las 26 tablas) desde la carpeta del backend:

```bash
cd /opt/cuentas/cuentas-api
mysql -h TU_MYSQL -P PUERTO_MYSQL -u cuentas -p cuentas < prisma/mysql/init.sql
```

## 3. Generar contraseñas y secretos (no te los inventes)

Genera las claves **en el servidor** y guárdalas en tu gestor de contraseñas:

```bash
# Contraseña de MySQL (24 bytes en hexadecimal: sin caracteres especiales,
# no necesita codificarse en la URL)
openssl rand -hex 24

# Secreto para las sesiones JWT (48 bytes)
openssl rand -hex 48
```

> Usar formato **hexadecimal** evita el problema más común: contraseñas con
> `@`, `/`, `:` o `#` que rompen la URL de conexión. Si aun así quieres usar
> caracteres especiales, revisa la sección 10.

Si ya creaste el usuario en el paso 2 con otra contraseña, cámbiala:

```sql
ALTER USER 'cuentas'@'IP_DEL_SERVIDOR_DOCKER' IDENTIFIED BY 'LA_CLAVE_GENERADA';
FLUSH PRIVILEGES;
```

## 4. Configurar el `.env.production`

```bash
cd /opt/cuentas/cuentas-api
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production        # o el editor que prefieras
```

Valores mínimos a editar:

```ini
# --- Base de datos -----------------------------------------------------------
# Formato: mysql://usuario:clave@host:puerto/base
# (el puerto es el de TU MySQL; aquí un ejemplo no típico, 3307)
DATABASE_URL=mysql://cuentas:TU_CLAVE_HEX@TU_MYSQL:3307/cuentas

# --- Dominio público ----------------------------------------------------------
CORS_ORIGINS=https://app.tudominio.com
WEB_APP_URL=https://app.tudominio.com

# --- Sesiones -----------------------------------------------------------------
JWT_SECRET=EL_HEX_DE_48_BYTES

# --- Registro -----------------------------------------------------------------
LOG_LEVEL=info
DOCS_ENABLED=false
```

Guarda y cierra. Para verificar que la URL está bien armada:

```bash
node -e "const fs=require('fs'); const url=(fs.readFileSync('.env.production','utf8').match(/^DATABASE_URL=(.+)$/m)||[])[1]; if(!url){console.error('No encontre DATABASE_URL');process.exit(1);} const u=new URL(url.trim()); console.log('usuario:',u.username,'host:',u.hostname,'puerto:',u.port,'base:',u.pathname);"
```

Debe imprimir `usuario: cuentas host: TU_MYSQL puerto: 3307 base: /cuentas`. Si el
host o el usuario salen raros, la contraseña tiene caracteres sin codificar
(sección 10.3).

## 5. Elegir puertos no típicos

El compose ya sabe leer un archivo **`.env`** (junto al `docker-compose.yml`)
para los puertos publicados. Créalo:

```bash
cd /opt/cuentas/cuentas-api
nano .env
```

> Este `.env` es **solo para `docker compose`** (puertos y nombres). No se pasa a
> los contenedores: las claves y secretos van en `.env.production` (sección 4).

```ini
# Front: <IP_del_host>:<puerto_del_host>. El puerto interno (80) lo agrega el compose.
# - 0.0.0.0 permite acceso desde fuera; usa 127.0.0.1 si pondrás un proxy con HTTPS.
WEB_BIND=0.0.0.0:8456

# API: <IP_del_host>:<puerto_del_host>. El interno (3000) lo agrega el compose.
# Solo local, para depurar (curl). No lo abras a Internet.
API_BIND=127.0.0.1:31415

# Nombre del servidor para nginx (tu dominio, o "_" para cualquiera).
SERVER_NAME=app.tudominio.com

# Destino interno del proxy del front (no hace falta cambiarlo).
API_BACKEND=http://api:3000
```

**Importante:** no agregues `:80` ni `:3000` al final de `WEB_BIND`/`API_BIND`;
el compose ya agrega el puerto interno. Si escribes `127.0.0.1:31415:3000` el
compose falla con `invalid IP address`.

| Variable | Para qué | Ejemplo no típico |
|---|---|---|
| `WEB_BIND` | Entrada al front (navegador) | `0.0.0.0:8456` |
| `API_BIND` | API solo para depurar en el host | `127.0.0.1:31415` |
| `DATABASE_URL` (`.env.production`) | Puerto de MySQL | `...:3307/cuentas` |
| `SERVER_NAME` | Dominio que atiende nginx | `app.tudominio.com` |

Notas:

- Los puertos **internos** (`80` y `3000`) no se tocan; solo cambias el número
  externo. `8456` es solo un ejemplo: elige el que quieras (evita el 80/443/3000/3306
  si están ocupados).
- Los puertos del **desarrollo local** (API `3000` en tu PC, Vite `5173` y las
  pruebas E2E) son independientes: no estorban a los del servidor.
- Si eliges un puerto menor a 1024 (por ejemplo `80`), necesitarás privilegios;
  con `8456` no.

## 6. Construir y levantar

```bash
cd /opt/cuentas/cuentas-api
docker compose build          # primera vez: tarda varios minutos
docker compose up -d
docker compose ps             # api y web deben aparecer "healthy"
```

Qué acaba de pasar:

1. Se compiló el backend con el cliente de Prisma para MySQL.
2. Se compiló la PWA y se sirve con nginx.
3. El front habla con la API por la red interna de Docker (`api:3000`).
4. La API se conecta a tu MySQL con `DATABASE_URL`.

## 7. Cargar datos del sistema (seed)

La primera vez hay que insertar categorías, reglas de recomendación y días
inhábiles (es idempotente: no duplica si lo repites):

```bash
cd /opt/cuentas/cuentas-api
docker compose --profile seed run --rm --build api-seed
```

Debe terminar con un resumen tipo `categorías: X creadas, Y existentes`.

## 8. Comprobar que todo funciona

Desde el propio servidor (usa tus puertos no típicos):

```bash
# La API responde (solo desde el host)
curl -fsS http://127.0.0.1:31415/health/live

# El front responde y a su vez alcanza la API
curl -fsS http://127.0.0.1:8456/health

# La PWA se sirve
curl -sI http://127.0.0.1:8456/ | head -n 1      # HTTP/1.1 200 OK
```

Desde tu navegador: `http://IP_DEL_SERVIDOR:8456` (o `https://app.tudominio.com`
si ya montaste HTTPS). Regístrate, verifica el correo según la configuración de
correo y crea una cuenta de efectivo.

Si el host tiene firewall (`ufw`), abre solo el puerto del front:

```bash
sudo ufw allow 8456/tcp
```

## 9. HTTPS y dominio (recomendado, casi obligatorio)

En producción usa siempre HTTPS: la PWA y la cookie de sesión lo requieren, y el
acceso debe ser por **dominio** (no por `IP:8456`), porque la cookie del refresh
usa `SameSite=Strict`.

La forma más simple es un proxy en el host. Con **Caddy** (TLS automático):

```bash
sudo apt install caddy
```

`/etc/caddy/Caddyfile`:

```caddy
app.tudominio.com {
    reverse_proxy 127.0.0.1:8456
}
```

```bash
sudo systemctl reload caddy
```

Con **nginx + certbot** es equivalente: `proxy_pass http://127.0.0.1:8456;`
reenviando `Host` y `X-Forwarded-*`. Si pones un proxy delante, cambia
`WEB_BIND` a `127.0.0.1:8456` para que solo el proxy pueda entrar.

## 10. Contraseñas y secretos en producción (lo correcto y seguro)

### 10.1 Dónde vive cada cosa

| Secreto | Dónde va | Dónde NO va |
|---|---|---|
| Clave de MySQL | `.env.production` (línea `DATABASE_URL`) | código, README, `.env.example` |
| `JWT_SECRET` | `.env.production` | imágenes Docker, `docker-compose.yml` |
| Claves de usuarios de la app | Base de datos (hash **argon2id**) | nunca en claro, nunca en logs |

Reglas:

1. **Nunca subas `.env.production` al repositorio.** Ya está en `.gitignore`;
   compruébalo: `git check-ignore .env.production` debe imprimir la ruta.
2. Permisos: `chmod 600 .env.production` (solo el dueño puede leerlo).
3. No pongas secretos en `.env.example` (es un archivo versionado). Si algún día
   ves una clave real ahí, cámbiala y limpia el archivo.
4. El compose pasa los secretos al contenedor con `env_file`; **no** se hornean
   en la imagen. Aun así, cualquiera con acceso al socket de Docker puede ver
   variables con `docker inspect`: limita quién entra al servidor.

### 10.2 Generar contraseñas fuertes

```bash
openssl rand -hex 24     # MySQL u otros servicios (sin caracteres especiales)
openssl rand -hex 48     # JWT_SECRET (mínimo 32 caracteres)
```

Guárdalas en un gestor de contraseñas (Bitwarden, 1Password, KeePass…). No las
reutilices entre servicios y no las compartas por chat/correo.

### 10.3 Caracteres especiales en `DATABASE_URL`

La URL se corta en el primer `@` de la contraseña, así que hay que
**codificarla** (porcentaje). Tabla rápida:

| Carácter | Se escribe |
|---|---|
| `@` | `%40` |
| `:` | `%3A` |
| `/` | `%2F` |
| `?` | `%3F` |
| `#` | `%23` |
| `%` | `%25` |
| `&` | `%26` |
| `=` | `%3D` |
| `+` | `%2B` |

Ejemplo: si la clave es `Mi@Pass/2026`, la URL queda:

```ini
DATABASE_URL=mysql://cuentas:Mi%40Pass%2F2026@TU_MYSQL:3307/cuentas
```

> Truco: usa claves en hex (`openssl rand -hex 24`) y olvídate de codificar.

### 10.4 Privilegios mínimos

- El usuario `cuentas` solo tiene permisos sobre `cuentas.*`, nunca `root`.
- El `GRANT` va a `'cuentas'@'IP_DEL_SERVIDOR_DOCKER'`, no a `'%'`.
- En el firewall: MySQL solo accesible desde la IP del servidor Docker; la API
  (`31415`) solo en `127.0.0.1`; a Internet solo el front (`8456`/HTTPS).

### 10.5 Rotación

```sql
-- En MySQL
ALTER USER 'cuentas'@'IP_DEL_SERVIDOR_DOCKER' IDENTIFIED BY 'NUEVA_CLAVE_HEX';
FLUSH PRIVILEGES;
```

```bash
# En el servidor Docker
nano .env.production      # actualiza DATABASE_URL
docker compose up -d      # recrea api con la nueva clave
```

Rotar `JWT_SECRET` cierra todas las sesiones: todos vuelven a iniciar sesión
(hazlo si sospechas que se filtró).

### 10.6 Qué hace la app por ti

- Guarda las contraseñas de los usuarios con **argon2id** (nunca en claro).
- Bloquea la cuenta 15 minutos tras 5 intentos fallidos.
- Usa tokens de verificación/recuperación de un solo uso y con caducidad.
- Nunca devuelve hashes ni revela si un correo existe.

Checklist final:

- [ ] `.env.production` con permisos `600` y fuera de git.
- [ ] Contraseñas generadas con `openssl` y guardadas en un gestor.
- [ ] Claves sin caracteres especiales (o codificadas en la URL).
- [ ] Usuario MySQL dedicado, con `GRANT` restringido por IP.
- [ ] Solo el puerto del front expuesto a Internet; API en localhost.
- [ ] HTTPS activo y acceso por dominio.
- [ ] Respaldos programados (sección 12).

## 11. Actualizar el proyecto

```bash
cd /opt/cuentas/cuentas-api && git pull
cd ../cuentas-web && git pull
cd ../cuentas-api
docker compose build
docker compose up -d
```

Si cambió el esquema de la base (te lo dirá el repo), aplica el diff:

```bash
docker compose --profile seed run --rm api-seed npm run mysql:diff
# revisa el SQL y aplícalo a MySQL
```

## 12. Respaldos

En el servidor MySQL (o donde tengas acceso):

```bash
mysqldump -h TU_MYSQL -P PUERTO_MYSQL -u cuentas -p --single-transaction cuentas > cuentas-$(date +%F).sql
```

Programa un cron diario y guarda los archivos fuera del servidor.

## 13. Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `docker: command not found` | Docker no instalado | `sudo apt install docker.io docker-compose-v2` |
| `api` no aparece `healthy` | No conecta a MySQL | `docker compose logs api`; revisa `DATABASE_URL`, el `GRANT` por IP y el firewall |
| Error `P1000/P1001` al conectar | Usuario o clave incorrectos / clave sin codificar | Corrige `.env.production` (sección 10.3) |
| El navegador da 502 | El front no alcanza la API | `docker compose ps` y `docker compose logs web`; `API_BACKEND` debe ser `http://api:3000` |
| `port is already allocated` | El puerto del host está ocupado | Cambia `WEB_BIND`/`API_BIND` en `.env` y `docker compose up -d` |
| Faltan categorías al registrar gastos | No corriste el seed | `docker compose --profile seed run --rm --build api-seed` |
| Al recargar me saca al login | Entraste por IP:puerto en vez del dominio | Usa siempre el dominio del front (cookie `SameSite=Strict`) |
| `permission denied` al montar | Usuario sin permiso sobre la carpeta | Usa un usuario con acceso a `/opt/cuentas` o ajusta permisos |

Comandos útiles:

```bash
docker compose ps                  # estado y salud
docker compose logs -f api         # ver registros en vivo
docker compose restart api         # reiniciar un servicio
docker compose down                # apagar (los datos viven en MySQL)
```

## 14. Si quieres más detalle

- [despliegue-docker.md](despliegue-docker.md) — referencia avanzada (perfiles, seed, actualizaciones, respaldos).
- [despliegue-3-maquinas.md](despliegue-3-maquinas.md) — escenario sin Docker (systemd + nginx en máquinas separadas).
