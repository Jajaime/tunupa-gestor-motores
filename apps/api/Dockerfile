# Tunupa API: build sobre Debian/glibc para argon2; runtime minimo Distroless.
FROM node:24-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:24-trixie-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# argon2 requiere scripts de instalacion y sus bindings nativos.
RUN npm ci --omit=dev --no-audit --no-fund

FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=1000:1000 /app/package.json ./package.json
COPY --from=deps --chown=1000:1000 /app/node_modules ./node_modules
COPY --from=build --chown=1000:1000 /app/dist ./dist
USER 1000:1000
EXPOSE 3002
# ENTRYPOINT del runtime Distroless: /nodejs/bin/node (no shell).
CMD ["dist/main.js"]
