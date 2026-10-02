# syntax=docker/dockerfile:1

# ---------- Etapa de compilacion ----------
FROM node:24-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN npx prisma generate && npm run build && npm prune --omit=dev

# ---------- Etapa de ejecucion ----------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:3000/health || exit 1

# Aplica migraciones y arranca. La base SQLite vive en el volumen /data.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
