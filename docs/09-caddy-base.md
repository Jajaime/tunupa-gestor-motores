# 09 — Caddy local, pruebas iniciales

This is a local-only reverse proxy overlay. Does not expose Grafana; Grafana stays at `127.0.0.1:3001`. Does not configure public domains or TLS.

## Before launch

- Next.js listens on 3000, NestJS listens on 3002. Confirm via `ss -ltn` and `curl`.
- Set `APP_PORT=3002` and `WEB_ORIGIN=http://localhost:8080` in the API's actual environment file. Re-launch the API after updates.
- Set `NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1` in the web's `.env.local` (or use a relative `/api/v1` only if the existing code supports it). Re-launch Next.js; client-side Next public vars are captured at build/start.
- IMPORTANT: Check API `Origin`/CORS and WebSocket adapter; they must accept `http://localhost:8080`. Keep credentials/cookies and CSRF enabled.
- This does NOT add TLS: keep `AUTH_COOKIE_SECURE=false` only for local HTTP testing, and use `true` with HTTPS in production. Do not expose HTTP remotely.
- Caddy on Docker Desktop may access WSL host through `host.docker.internal`. On a native Linux Docker Engine, services bound solely to 127.0.0.1 might not be reachable through `host-gateway`; bind them on an appropriate host/interface only after examining exposure, or containerize the apps. A Caddy 502 means upstream reachability needs fixing, not a database fault.

## Commands

```sh
docker compose -f compose.yaml -f compose.caddy.yaml config --quiet
docker compose -f compose.yaml -f compose.caddy.yaml up -d caddy
docker compose -f compose.yaml -f compose.caddy.yaml ps caddy
docker compose -f compose.yaml -f compose.caddy.yaml logs --tail=50 caddy
curl -i http://localhost:8080/api/v1/health
curl -i http://localhost:8080/
```

Check auth CSRF/login/logout, cookies, dashboard, Socket.IO reconnection from `http://localhost:8080` (Browser DevTools > Network > WS). Verify `localhost:3001` Grafana unchanged. Do not mark accepted until tests pass. Use `docker compose -f compose.yaml -f compose.caddy.yaml stop caddy` to roll back runtime.

## Important

- `handle` preserves upstream paths; do not use `handle_path` for `/api/v1` or `/socket.io`.
- The Caddyfile does not disable CORS, CSRF or session validation.
- Restrict local use; no public inbound HTTP, production domains, or HTTPS yet.
