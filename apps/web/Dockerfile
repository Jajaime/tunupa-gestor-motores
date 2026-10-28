# Tunupa Web: compilar Next.js standalone en Debian; runtime Distroless.
FROM node:24-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# NEXT_PUBLIC_* se incorpora al JS durante el build. Nunca incluir secretos.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN test -n "$NEXT_PUBLIC_API_URL" && npm run build

FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build --chown=1000:1000 /app/.next/standalone ./
COPY --from=build --chown=1000:1000 /app/.next/static ./.next/static
USER 1000:1000
EXPOSE 3000
# ENTRYPOINT del runtime Distroless: /nodejs/bin/node (no shell).
CMD ["server.js"]
