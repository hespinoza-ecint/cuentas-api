# Despliegue con Docker: backend + frontend (MySQL externo)

Escenario: dos contenedores en el **mismo host Docker** — `api` (NestJS +
Fastify) y `web` (nginx + PWA) — conectados a un **MySQL externo**.

```
                         https (certbot u otro proxy delante, opcional)
Navegador ────────────────────► web (nginx :80)            [contenedor]
                                  │  /             PWA estática (dist/)
                                  │  /api,/health  proxy ──► api:3000   [contenedor]
                                                              │  mysql:// (3306)
                                                              ▼
                                                            MySQL (servidor externo)
```

Mismo origen para el navegador (sin CORS y con la cookie del refresh
`SameSite=Strict`), PWA con cache correcto y backend aislado y sin privilegios.

---

## 0. Requisitos

- Docker Engine 24+ con el plugin `docker compose` (Ubuntu:
  `sudo apt install docker.io docker-compose-v2`, o el repositorio oficial de Docker).
- Los dos repos clonados **como hermanos**:

  ```
  /opt/cuentas/
    cuentas-api/
    cuentas-web/
  ```

- Acceso del host Docker al MySQL externo (puerto 3306 permitido).

## 1. Preparar MySQL (una sola vez)

Es la misma sección 1 de [despliegue-3-maquinas.md](despliegue-3-maquinas.md):
crea la base y el usuario (con la IP del host Docker) y aplica el esquema:

```sql
CREATE DATABASE cuentas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'cuentas'@'IP_DEL_HOST_DOCKER' IDENTIFIED BY 'CONTRASENA_FUERTE';
GRANT ALL PRIVILEGES ON cuentas.* TO 'cuentas'@'IP_DEL_HOST_DOCKER';
FLUSH PRIVILEGES;
```

```bash
mysql -h IP_MYSQL -u cuentas -p cuentas < prisma/mysql/init.sql
```

`prisma/mysql/init.sql` es el esquema completo para una base **vacía** y se
regenera con `npm run mysql:sql` (también dentro de la imagen de tareas, §6).
Para bases existentes aplica solo el diff (`mysql:diff`, §5).

## 2. Configurar el entorno

```bash
cd cuentas-api
cp .env.production.example .env.production
```

Ajusta como mínimo:

- `DATABASE_URL=mysql://cuentas:CONTRASENA@IP_MYSQL:3306/cuentas`
- `JWT_SECRET` —
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `CORS_ORIGINS` y `WEB_APP_URL` con tu dominio público (se usan en enlaces y
  correos; con el proxy del front el navegador no hace CORS).

El compose lee ese archivo con `env_file`; no hace falta exportar nada.

Opcionales del compose (defaults entre paréntesis; se cambian en un archivo
`.env` junto al `docker-compose.yml`):

| Variable | Default | Para qué |
|---|---|---|
| `WEB_BIND` | `8080:80` | Puerto público del front (`80:80` si no hay proxy delante) |
| `API_BIND` | `127.0.0.1:3000` | Publicación del API (solo depuración) |
| `API_BACKEND` | `http://api:3000` | Destino del proxy nginx del front |
| `SERVER_NAME` | `_` | `server_name` de nginx (tu dominio) |

## 3. Levantar

```bash
docker compose build
docker compose up -d
docker compose ps
```

La primera vez hay que cargar los **datos del sistema** (categorías, reglas de
recomendación y días inhábiles):

```bash
docker compose --profile seed run --rm --build api-seed
```

Verificación:

```bash
curl -fsS http://127.0.0.1:3000/health/live   # API viva (dentro del host)
curl -fsS http://127.0.0.1:8080/health        # a través del front
curl -fsSI http://127.0.0.1:8080/ | head -n 1 # PWA servida
```

## 4. HTTPS

El contenedor `web` sirve HTTP (puerto `8080` por defecto). Opciones:

- **Proxy en el host (recomendado):** nginx o Caddy con certbot →
  `proxy_pass http://127.0.0.1:8080;` reenviando `Host` y `X-Forwarded-*`.
- **Contenedor adicional** (Caddy/Traefik) en la misma red, apuntando a `web:80`.

HTTPS es obligatorio en producción: la PWA y la cookie del refresh lo requieren.
Entra siempre por el dominio del front (no por `IP:8080` ni `IP:3000`) para que
el origen de la cookie coincida.

## 5. Actualizaciones

```bash
cd /opt/cuentas/cuentas-api && git pull
cd ../cuentas-web && git pull
cd ../cuentas-api
docker compose build
docker compose up -d
```

Si cambió el esquema MySQL:

```bash
docker compose --profile seed run --rm api-seed npm run mysql:diff
```

Revisa el SQL generado y aplícalo a la base. También puedes regenerar
`prisma/mysql/init.sql` con `npm run mysql:sql` (útil solo para instalaciones
nuevas).

## 6. Tareas puntuales (imagen `api-seed`)

La etapa `seed` reutiliza la compilación con devDependencies y el CLI de Prisma:

```bash
docker compose --profile seed build api-seed
docker compose --profile seed run --rm api-seed                      # seed
docker compose --profile seed run --rm api-seed npm run mysql:diff   # diff de esquema
docker compose --profile seed run --rm api-seed npm run mysql:sql    # regenerar init.sql
```

## 7. Respaldos

El respaldo vive en el servidor MySQL:

```bash
mysqldump -h IP_MYSQL -u cuentas -p --single-transaction cuentas > cuentas-$(date +%F).sql
```

Programa un cron diario en ese servidor (o donde tengas acceso).

## 8. Troubleshooting

- **`api` unhealthy:** `docker compose logs api`. Si no conecta a MySQL revisa
  `DATABASE_URL`, el `GRANT` con la IP correcta del host Docker y el firewall.
- **El front no alcanza la API:** `docker compose ps` (ambos en la misma red) y
  `API_BACKEND` (`http://api:3000` por defecto).
- **401/403 al recargar:** la cookie del refresh exige mismo origen; entra por el
  dominio del front.
- **Faltan categorías del sistema:** corre el seed (§3).
- **¿Y el compose anterior con SQLite?** Ya no se usa; su volumen
  `cuentas-data` puede conservarse como respaldo. Para pasar datos a MySQL usa
  la exportación de la app (*Cuenta y datos → Descargar exportación*) antes de
  migrar.

## 9. Relación con la guía de 3 máquinas

[despliegue-3-maquinas.md](despliegue-3-maquinas.md) sigue siendo la guía para
instalaciones **sin Docker** (systemd + nginx en máquinas separadas). Su
sección 1 (MySQL) aplica tal cual para el servidor externo.
