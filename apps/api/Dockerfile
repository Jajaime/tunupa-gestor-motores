# Contexto de build: ./apps/api. Node 24 y Debian para argon2 nativo.
FROM node:24-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:24-trixie-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# argon2 necesita su modulo nativo: no desactivar scripts de instalacion.
# npm solo se usa para instalar dependencias: no es necesario en ejecucion.
# Retirar npm global evita incluir sus dependencias CLI en la imagen final.
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3002
CMD ["node", "dist/main.js"]
