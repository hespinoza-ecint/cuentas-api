# Despliegue en 3 máquinas (Ubuntu Server): API · Front · MySQL

Guía para el escenario objetivo: **backend en una máquina Ubuntu**, **frontend
en otra** y **MySQL en un servidor dedicado**. El navegador solo habla con el
dominio del front; nginx reenvía `/api` al backend.

```
                 https
Navegador ────────────────► Front (nginx, Ubuntu)         10.0.0.10
                              │  /            dist estático
                              │  /api,/health proxy ─────► API (Nest+Fastify, Ubuntu)  10.0.0.20
                                                             │  mysql:// (3306, red privada)
                                                             ▼
                                                          MySQL (Ubuntu)                 10.0.0.30
```

Sustituye `10.0.0.x` y `app.tudominio.com` por tus valores.

---

## 1. Servidor MySQL

```bash
sudo apt update && sudo apt install -y mysql-server
sudo mysql_secure_installation
```

Crear base, usuario de la API y usuario de pruebas (este último solo si vas a
correr `npm run test:mysql` desde el servidor de la API):

```sql
CREATE DATABASE cuentas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'cuentas'@'10.0.0.20' IDENTIFIED BY 'CONTRASENA_FUERTE';
GRANT ALL PRIVILEGES ON cuentas.* TO 'cuentas'@'10.0.0.20';

CREATE USER 'cuentas_test'@'10.0.0.20' IDENTIFIED BY 'OTRA_CONTRASENA';
GRANT ALL PRIVILEGES ON `cuentas\_test\_%`.* TO 'cuentas_test'@'10.0.0.20';

FLUSH PRIVILEGES;
```

Permitir conexiones desde la máquina de la API (`/etc/mysql/mysql.conf.d/mysqld.cnf`):

```ini
bind-address = 0.0.0.0
```

```bash
sudo systemctl restart mysql
sudo ufw allow from 10.0.0.20 to any port 3306 proto tcp
```

Verifica desde la máquina de la API (más adelante):

```bash
mysql -h 10.0.0.30 -u cuentas -p -e "SELECT 1"
```

---

## 2. Máquina de la API (backend)

### 2.1 Requisitos

```bash
sudo apt update
sudo apt install -y git curl build-essential mysql-client
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v24.x
```

### 2.2 Código y dependencias

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin cuentas
sudo mkdir -p /opt/cuentas-api && sudo chown cuentas: /opt/cuentas-api
# copia el repo (git clone o rsync desde tu equipo)
sudo -u cuentas git clone <repo> /opt/cuentas-api
cd /opt/cuentas-api
sudo -u cuentas npm ci
```

### 2.3 Configuración

```bash
sudo -u cuentas cp .env.production.example .env
sudo -u cuentas nano .env
```

Ajusta como mínimo: `DATABASE_URL` (apuntando al servidor MySQL),
`CORS_ORIGINS` y `WEB_APP_URL` (el dominio del front) y `JWT_SECRET`
(genéralo con el comando que está en el propio archivo).

### 2.4 Base de datos: esquema, cliente y seed

```bash
# 1) Genera el SQL completo (no necesita conexión)
sudo -u cuentas npm run mysql:sql          # crea prisma/mysql/init.sql (26 tablas)

# 2) Aplícalo en el servidor MySQL
mysql -h 10.0.0.30 -u cuentas -p cuentas < prisma/mysql/init.sql
#    (alternativa: sudo -u cuentas npm run mysql:apply)

# 3) Genera el cliente Prisma para MySQL y compila
sudo -u cuentas npm run mysql:generate
sudo -u cuentas npm run build

# 4) Datos iniciales (categorías, festivos MX y reglas): idempotente
sudo -u cuentas npm run db:seed
```

> **Importante:** el cliente de Prisma se genera por proveedor. En esta máquina
> usa siempre `npm run mysql:generate`; si algún día corres las pruebas SQLite
> (`npm test`), el setup vuelve a generar el cliente SQLite automáticamente.

### 2.5 Servicio systemd

```bash
sudo cp deploy/cuentas-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cuentas-api
sudo systemctl status cuentas-api
```

Abre el puerto solo para la máquina del front:

```bash
sudo ufw allow from 10.0.0.10 to any port 3000 proto tcp
sudo ufw enable
```

Verificación:

```bash
curl http://localhost:3000/health     # {"status":"ok", checks.database.status:"up"}
```

### 2.6 (Opcional) Validar con la suite MySQL

```bash
npm run test:mysql -- mysql://cuentas_test:OTRA_CONTRASENA@10.0.0.30:3306
```

Crea bases `cuentas_test_1..N`, corre las 38 suites contra MySQL y las elimina.

---

## 3. Máquina del frontend

### 3.1 Build

```bash
sudo apt update && sudo apt install -y git curl nginx
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

sudo mkdir -p /opt/cuentas-web && sudo chown $USER: /opt/cuentas-web
git clone <repo-front> /opt/cuentas-web
cd /opt/cuentas-web
npm ci
npm run build            # genera dist/ (PWA con service worker)
```

### 3.2 nginx

Copia `deploy/nginx.conf.example` a `/etc/nginx/sites-available/cuentas` y
ajusta dos líneas:

```nginx
server_name app.tudominio.com;
set $api_backend http://10.0.0.20:3000;
```

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/cuentas
sudo nano /etc/nginx/sites-available/cuentas
sudo ln -s /etc/nginx/sites-available/cuentas /etc/nginx/sites-enabled/cuentas
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

El `root` del sitio apunta a `/var/www/cuentas-web/dist`; copia ahí el build:

```bash
sudo mkdir -p /var/www/cuentas-web && sudo cp -r dist /var/www/cuentas-web/
```

### 3.3 HTTPS (obligatorio para la PWA y para las cookies)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app.tudominio.com
```

- El front debe servirse por **HTTPS**: el service worker y la cookie
  `Secure` del refresh lo requieren.
- Como el navegador solo habla con el front, no hay CORS: nginx reenvía
  `/api` al backend y la cookie `SameSite=Strict` funciona.

Verificación final: abre `https://app.tudominio.com`, regístrate, verifica el
correo y entra. `https://app.tudominio.com/health` debe responder 200 (lo
reenvía nginx).

---

## 4. Actualizaciones

### Backend

```bash
cd /opt/cuentas-api
sudo -u cuentas git pull
sudo -u cuentas npm ci
# Si el esquema cambió: genera el SQL de diferencias y aplícalo
sudo -u cuentas npm run mysql:diff > cambios.sql
mysql -h 10.0.0.30 -u cuentas -p cuentas < cambios.sql
sudo -u cuentas npm run build
sudo systemctl restart cuentas-api
```

### Frontend

```bash
cd /opt/cuentas-web
git pull && npm ci && npm run build
sudo rsync -a --delete dist/ /var/www/cuentas-web/dist/
sudo systemctl reload nginx
```

---

## 5. Respaldos de MySQL

```bash
sudo mkdir -p /var/backups/cuentas
sudo crontab -e
```

```cron
# Respaldo diario a las 03:15, conserva 14 días
15 3 * * * mysqldump --single-transaction -h 10.0.0.30 -u cuentas -p'CONTRASENA' cuentas | gzip > /var/backups/cuentas/cuentas-$(date +\%F).sql.gz && find /var/backups/cuentas -name 'cuentas-*.sql.gz' -mtime +14 -delete
```

---

## 6. Problemas comunes

| Síntoma | Causa / solución |
|---|---|
| `P1012` / “provider mismatch” al arrancar | El cliente Prisma no es de MySQL: `npm run mysql:generate` y vuelve a compilar |
| `P1001` can't reach database | `bind-address`, firewall de MySQL o IP del usuario (`'cuentas'@'10.0.0.20'`) |
| `P1000` authentication failed | Usuario/contraseña; codifica caracteres especiales en `DATABASE_URL` |
| Login funciona pero la sesión no persiste | El front no está en HTTPS, o `CORS_ORIGINS` no incluye el origen exacto (`https://app.tudominio.com`) |
| `/api/*` responde 502 | nginx apunta a una IP/puerto incorrectos, o el backend no está arriba (`systemctl status cuentas-api`) |
| La PWA no se actualiza | Verifica que `/sw.js` e `/index.html` no se cacheen (el ejemplo de nginx ya lo hace) |
