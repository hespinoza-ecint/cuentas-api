# Actualizar el esquema de MySQL en producción

> Guía operativa. Aplica igual para el despliegue con Docker y el de 3 máquinas.

Producción **no migra sola**: ni la app ni el contenedor aplican cambios de
esquema (ver `despliegue-docker.md` §5). Cuando un lote de cambios toca
`prisma/schema.prisma` o `prisma/schema.mysql.prisma`, el esquema de MySQL se
actualiza a mano con este procedimiento.

**Orden obligatorio:** primero el SQL, después el código nuevo. El código nuevo
escribe y lee columnas/tablas que la base vieja no tiene (daría error 500 en
cuanto se use); el código viejo contra el esquema nuevo no se rompe (todos los
cambios son aditivos), así que ese orden es el seguro.

---

## 1. Cambios de esquema registrados

Pendientes del lote de mejoras (fases 22–28):

| Fase | Cambio en MySQL | Para qué |
|---|---|---|
| 25 | Columna `status` en `IdempotencyRecord` | Reserva `IN_PROGRESS`/`COMPLETED` de idempotencia |
| 26 | Tabla `RecurringExpenseSkip` (+ 2 FK) | Ocurrencias omitidas de recurrentes |

La fuente de verdad es `prisma/mysql/init.sql` (esquema completo para una base
**vacía**; se regenera con `npm run mysql:sql`). El SQL exacto de estos dos
cambios está en el paso 4. Al agregar cambios de esquema en el futuro, **suma
una fila a esta tabla**.

> La referencia definitiva siempre es el diff contra tu base real (paso 3): si
> tu instalación arrastra más diferencias, ahí aparecen todas.

---

## 2. Respaldo

En el servidor de MySQL (o donde tengas acceso):

```bash
mysqldump -h HOST_MYSQL -u cuentas -p --single-transaction cuentas > cuentas-$(date +%F)-antes.sql
```

---

## 3. Generar el SQL de diferencias (solo lectura)

`prisma migrate diff` compara tu **base real** contra el modelo actual y
escribe las sentencias para igualarlas. Es de solo lectura: no modifica la base.

**Opción A — desde tu PC (Windows)** — tu equipo debe alcanzar el MySQL:

```powershell
cd cuentas-api
$env:DATABASE_URL = "mysql://cuentas:CONTRASENA@HOST_MYSQL:3306/cuentas"
npx.cmd prisma migrate diff --from-schema-datasource prisma/schema.mysql.prisma --to-schema-datamodel prisma/schema.mysql.prisma --script --output cambios.sql
```

La variable de la sesión tiene prioridad sobre tu `.env` local, y `--output`
evita los problemas de codificación de `>` en PowerShell.

**Opción B — desde el servidor con Docker** (requiere `git pull` previo, porque
usa el archivo `schema.mysql.prisma` del repo):

```bash
cd /opt/cuentas/cuentas-api
git pull
docker compose --profile seed run --rm api-seed npm run --silent mysql:diff > cambios.sql
```

Revisa el archivo antes de aplicarlo (`cat cambios.sql`). Con la base ya al
día, el diff sale vacío.

---

## 4. Aplicar

### Desde archivo

Servidor (bash):

```bash
mysql -h HOST_MYSQL -u cuentas -p cuentas < cambios.sql
```

Windows (PowerShell no soporta `<`):

```powershell
Get-Content cambios.sql -Raw | mysql -h HOST_MYSQL -u cuentas -p cuentas
```

### A mano

SQL exacto de los cambios pendientes (copia literal de `prisma/mysql/init.sql`;
pégalo en Workbench, HeidiSQL, DBeaver o similar):

```sql
-- Fase 25: reserva de idempotencia
ALTER TABLE `IdempotencyRecord`
  ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'COMPLETED';

-- Fase 26: ocurrencias omitidas de recurrentes
CREATE TABLE `RecurringExpenseSkip` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `recurringExpenseId` VARCHAR(191) NOT NULL,
    `occurrenceDate` VARCHAR(191) NOT NULL,
    `reason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RecurringExpenseSkip_userId_idx`(`userId`),
    UNIQUE INDEX `RecurringExpenseSkip_recurringExpenseId_occurrenceDate_key`(`recurringExpenseId`, `occurrenceDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `RecurringExpenseSkip` ADD CONSTRAINT `RecurringExpenseSkip_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `RecurringExpenseSkip` ADD CONSTRAINT `RecurringExpenseSkip_recurringExpenseId_fkey` FOREIGN KEY (`recurringExpenseId`) REFERENCES `RecurringExpense`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
```

`npm run mysql:apply` **no** sirve para actualizar: ejecuta `init.sql` completo
(solo instalaciones nuevas; falla contra tablas existentes).

---

## 5. Verificar

```sql
SHOW COLUMNS FROM `IdempotencyRecord` LIKE 'status';
SHOW CREATE TABLE `RecurringExpenseSkip`;
```

Y repite el paso 3 en otro archivo: si el diff sale vacío, la base quedó al día.

---

## 6. Desplegar el código

Recién ahora, con el flujo normal de `despliegue-docker.md` §5 —o
`despliegue-3-maquinas.md` §4 si no usas Docker.

Después del despliegue, prueba de humo:

1. Registra un gasto (escribe `IdempotencyRecord.status`).
2. En Recurrentes, omite una ocurrencia (usa `RecurringExpenseSkip`).
3. Revisa los logs de la API sin errores (`docker compose logs -f api`).

---

## 7. Rollback

Los cambios son aditivos; para revertir el esquema (hazlo **antes** de
desplegar el código nuevo, que requiere ambas cosas):

```sql
ALTER TABLE `IdempotencyRecord` DROP COLUMN `status`;
DROP TABLE `RecurringExpenseSkip`;
```

También puedes restaurar completo desde el respaldo del paso 2:

```bash
mysql -h HOST_MYSQL -u cuentas -p cuentas < cuentas-AAAA-MM-DD-antes.sql
```
