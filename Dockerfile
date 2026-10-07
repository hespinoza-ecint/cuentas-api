# syntax=docker/dockerfile:1

# =============================================================================
# Backend de Cuentas (NestJS + Fastify + Prisma) para MySQL.
#
# Etapas:
#   build  compila el cliente de Prisma para MySQL y la app (Nest)
#   prod   runtime minimo, sin devDependencies y con usuario sin privilegios
#   seed   tareas puntuales (seed, mysql:diff, ...) con devDependencies
#
# La base MySQL es externa: aplica prisma/mysql/init.sql una sola vez en una
# base vacia y configura DATABASE_URL (ver docs/despliegue-docker.md).
#
#   docker compose build
#   docker compose up -d
#   docker compose --profile seed run --rm api-seed      # primera vez
# =============================================================================

# ---------- Compilacion ------------------------------------------------------
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NODE_ENV=development
# Solo para que el CLI de Prisma pueda validar el esquema al generar.
# El build no se conecta a ninguna base.
ENV DATABASE_URL=mysql://build:build@localhost:3306/build
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# El cliente que corre en produccion apunta a MySQL (esquema generado).
RUN npm run mysql:sql && npm run mysql:generate
RUN npm run build

# ---------- Runtime ----------------------------------------------------------
FROM node:24-bookworm-slim AS prod
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 cuentas \
  && useradd --system --uid 1001 --gid cuentas --home-dir /app cuentas
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Cliente generado en la etapa de build (incluye los engines de Prisma).
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/dist ./dist
# Esquema inicial de MySQL, por si se aplica desde el propio contenedor.
COPY --from=build /app/prisma/mysql/init.sql ./prisma/mysql/init.sql
USER cuentas
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

# ---------- Tareas puntuales (seed / esquema) --------------------------------
FROM build AS seed
ENV NODE_ENV=production
CMD ["npm", "run", "db:seed"]
