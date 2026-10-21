# 10 — API y Web contenerizados detrás de Caddy

## Alcance

Este overlay es alternativo a `compose.caddy.yaml`. No se deben pasar ambos al mismo
comando. La configuración WSL original queda intacta para reversión.

- API NestJS: Node 24, dos etapas de build, `api:3002` sin puerto expuesto al host.
- Web Next.js 16: salida `standalone`, `web:3000` sin puerto expuesto al host.
- Caddy local `127.0.0.1:8080` lleva `/api/v1/*` y `/socket.io/*` a `api:3002`
  y las demás rutas a `web:3000`.
- PostgreSQL, Mosquitto y Grafana siguen en los servicios y volúmenes existentes.
- No requiere `CADDY_WSL_HOST`; tampoco incorpora dominios, Grafana al proxy ni TLS.

## Antes del cambio

1. Confirmar que `09-caddy-base` funciona y que el repositorio está limpio.
2. Comprobar que `.env` de la raíz tiene **una sola** declaración por nombre:
   `WEB_ORIGIN=http://localhost:8080`, `AUTH_COOKIE_SECURE=false` (solo HTTP
   local), `CADDY_PORT=8080`, los parámetros PostgreSQL/MQTT y los secretos AUTH.
   No imprimir ni compartir secretos.
3. Ejecutar y registrar una copia de seguridad normal de PostgreSQL antes de cambiar
   el proceso responsable de ingerir telemetría.
4. No ejecutar simultáneamente NestJS en WSL y el servicio `api` de Docker:
   ambos consumirían los mismos tópicos MQTT y el watchdog sería duplicado.
5. **No ejecutar `down -v`**: eliminaría los volúmenes de TimescaleDB, Grafana y
   Mosquitto.

## Precompilar sin interrumpir WSL

```bash
docker compose -f compose.yaml -f compose.docker.yaml config --quiet
docker compose -f compose.yaml -f compose.docker.yaml build api web
```

La compilación Next.js incluye la URL pública derivada de `WEB_ORIGIN`:
`http://localhost:8080/api/v1`. `NEXT_PUBLIC_*` es información pública incrustada
en los archivos JS, no una variable secreta. Cuando cambie el dominio/puerto,
**reconstruir** `web`. Los `.env*` locales se excluyen del contexto de build.

## Corte controlado a Docker

1. Detener los procesos de NestJS y Next.js en sus terminales WSL (`Ctrl+C`).
   Mantener TimescaleDB, Mosquitto y Grafana.
2. La ingesta puede perder mensajes no retenidos por Mosquitto durante este
   breve intervalo; detener el simulador primero si se desea evitarlo.
3. Detener Caddy WSL y levantar la variante Docker (misma identidad de servicio,
   puerto y volúmenes).

```bash
docker compose -f compose.yaml -f compose.caddy.yaml stop caddy
docker compose -f compose.yaml -f compose.docker.yaml up -d --no-build api web caddy
docker compose -f compose.yaml -f compose.docker.yaml ps
docker compose -f compose.yaml -f compose.docker.yaml logs --tail=60 api web caddy
```

Los contenedores `api` y `web` no publican 3002/3000 al host; se alcanzan por
DNS Docker interno. Grafana permanece en `http://localhost:3001`.

## Aceptación

```bash
curl -fsS http://localhost:8080/api/v1/health
curl -I http://localhost:8080/
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/v1/dashboard/motors
```

Esperado: health 200 / frontend 200 / dashboard sin credenciales 401.
Desde `http://localhost:8080`, comprobar login, cookie y CSRF, motor y gráfico,
WebSocket `101` y `session.ready`, eventos `telemetry.received` del simulador,
renovación de sesión, logout y ausencia de nuevas reconexiones tras logout.
Detener y reiniciar solo `api` y comprobar recuperación del canal sin recargar.
No publicar este HTTP en Internet.

Inspección de redes (no volcar `docker compose config` sin `--quiet`):
```bash
docker compose -f compose.yaml -f compose.docker.yaml exec caddy caddy validate --config /etc/caddy/Caddyfile
docker compose -f compose.yaml -f compose.docker.yaml exec api node -e "fetch('http://web:3000').then(r=>console.log(r.status))"
docker compose -f compose.yaml -f compose.docker.yaml exec web node -e "fetch('http://api:3002/api/v1/health').then(r=>console.log(r.status))"
```

## Reversión a WSL

No eliminar volúmenes. Detener solo las aplicaciones y el Caddy de Docker:

```bash
docker compose -f compose.yaml -f compose.docker.yaml stop caddy api web
docker compose -f compose.yaml -f compose.caddy.yaml up -d --force-recreate --no-deps caddy
```

Reiniciar API y Web en WSL con la configuración ya validada (puertos 3002 y 3000).
Si la IP WSL cambió, actualizar `CADDY_WSL_HOST` en `.env` y recrear el Caddy
local. No ejecutar el backend en WSL mientras `api` Docker sigue levantada.

## Limitaciones de esta entrega

HTTP enlazado a loopback y cookie sin Secure son **solo desarrollo local**.
La configuración productiva requiere dominios, HTTPS, `AUTH_COOKIE_SECURE=true`,
controles de acceso y revisión de permisos de red. Grafana sigue con su acceso
local independiente. No se incluyen migraciones ni cambios a datos.
