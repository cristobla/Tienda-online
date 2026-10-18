# Imagen de producción: compila la tienda y la sirve con `npm run start` (puerto 3000). La misma imagen corre las
# tareas (`npm run jobs`), las migraciones, la carga de comunas y el alta del primer admin (tsx es dependencia
# de producción por eso).
# shortcut: código fuente + dependencias de producción; pasar a output "standalone" si el tamaño llega a importar.
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# La compilación no se conecta a la base; APP_URL queda en las páginas estáticas (p. ej. la de 404).
ARG APP_URL=https://localhost
# Medición (opcional): la CSP permite Google Analytics o el píxel de Meta solo si su ID existe al compilar.
ARG GA_ID=
ARG META_PIXEL_ID=
ENV NODE_ENV=production APP_ENV=production APP_URL=$APP_URL DATABASE_URL=postgres://compilacion@localhost/compilacion NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# Carpeta de fotos subidas (montar un volumen aquí): del usuario sin privilegios que corre la app.
RUN mkdir -p /data/uploads && chown node:node /data/uploads
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
# Migraciones pendientes al arrancar (son idempotentes) y luego el servidor.
CMD ["sh", "-c", "npm run db:migrate && npm run start"]
