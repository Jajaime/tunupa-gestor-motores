# 13 — Preparacion de dominios, HTTPS y puertos (opt-in)

## Estado

El parche **prepara** una variante de despliegue seguro, pero NO se activa al
aplicarlo. El modo HTTP local actual sigue siendo `compose.yaml +
compose.docker.yaml`, con Grafana bajo `/grafana/` y Caddy en localhost:8080.

**No ejecutar el overlay HTTPS en un PC WSL/Docker Desktop accesible desde
Internet sin revisar el encaminamiento Windows/WSL, el firewall, el NAT y la
administracion del servidor.** Para exponer motores industriales a usuarios
externos, considerar un servidor Linux administrado y controles adicionales.

## Requisitos previos obligatorios

1. Commit/push y pruebas correctas de `12-caddy-grafana`.
2. Docker Compose **>= 2.24.4** (se utiliza `!override` para REEMPLAZAR
   `ports` y `volumes`, no agregarlos). Comprobar con `docker compose version`.
3. Dominio/subdominio publico propio: en esta guia, `motores.example.com` es
   **ilustrativo**, no un dominio operativo.
4. Registros DNS A/AAAA correctos hacia el servidor publico; evitar AAAA
   erroneos. Puertos TCP **80** y **443** entrantes y libres; UDP 443 es
   opcional para HTTP/3. Si existen cortafuegos/NAT/CGNAT, resolverlos antes.
5. Rotar credenciales que hayan quedado expuestas (BD, MQTT, Grafana, JWT).
   Deshabilitar credenciales por defecto y revisar roles de Grafana.
6. Aplicar backups y procedimientos de restauracion de TimescaleDB y Grafana.
   No utilizar `docker compose down -v`.
7. Decidir si Grafana sera accesible a Internet: el login propio de Grafana NO
   reemplaza un control de acceso de red (VPN, IP allowlist o SSO).
8. Los dispositivos remotos NO deberian usar MQTT 1883 sin TLS. Este overlay
   lo limita a localhost; MQTT con TLS/mTLS para sensores externos requiere
   otra entrega y no queda resuelto por el HTTPS del dashboard.

## Archivos

- `compose.https.yaml`: overlay opcional para el ambiente HTTPS.
- `infrastructure/caddy/Caddyfile.https`: host publico y rutas.
- Este documento de preparacion, activacion, pruebas y retorno.

### Comportamiento del overlay

- Caddy publica 80/tcp, 443/tcp, 443/udp y obtiene/renueva certificados.
- Caddy envia `/api/v1/*` y `/socket.io/*` a `api:3002`, `/grafana/*` a
  `grafana:3000`, y las demas rutas a `web:3000`.
- API usa `WEB_ORIGIN=https://<dominio>` y `AUTH_COOKIE_SECURE=true`.
- El build de Next.js utiliza `NEXT_PUBLIC_API_URL=https://<dominio>/api/v1`.
- Grafana usa `GF_SERVER_ROOT_URL=https://<dominio>/grafana/`.
- PostgreSQL publica solo `127.0.0.1:${POSTGRES_PORT:-5432}:5432`.
- MQTT 1883 solo publica `127.0.0.1:1883:1883` (para el simulador local).
- Grafana deja de publicar su propio puerto 3001 al host.
- No se cambian bases de datos, migraciones, usuarios o volúmenes.

## Preparacion sin iniciar servicios HTTPS

Desde la raiz del repositorio, con el commit 12 ya efectuado:

```bash
git apply --check 13-caddy-https.patch
git apply 13-caddy-https.patch
git diff --check

docker compose version
# Sustituir por un dominio REAL que ya controles antes de desplegar.
CADDY_DOMAIN=motores.example.com docker compose \
  -f compose.yaml -f compose.docker.yaml -f compose.https.yaml \
  config --quiet
```

La ultima linea es **solo validacion de sintaxis** con un valor ilustrativo.
**No ejecutar `up`** hasta contar con DNS, red, firewall y permisos validados.
El overlay existente de desarrollo local no cambia por aplicar este parche.

## Activacion posterior, en un servidor autorizado

Con `CADDY_DOMAIN` de un dominio publico REAL:

1. Configurar la variable en un archivo `.env` privado, o exportarla en la
   sesion que ejecuta Compose; no incorporar secretos a Git.
2. Hacer backup, detener simulador/productores si fuera necesario, y elegir una
   ventana de mantenimiento. Garantizar que no queden dos API NestJS
   consumiendo los mismos topics MQTT.
3. Ejecutar este trio de Compose, en ese orden de archivos:

```bash
# Reemplaza el dominio de ejemplo por tu dominio real ANTES de usar estos comandos.
export CADDY_DOMAIN=motores.example.com
docker compose -f compose.yaml -f compose.docker.yaml -f compose.https.yaml \
  config --quiet
# El build web es obligatorio: NEXT_PUBLIC_API_URL cambia a HTTPS.
docker compose -f compose.yaml -f compose.docker.yaml -f compose.https.yaml \
  up -d --build api web grafana caddy
```

El container Caddy mantiene `caddy_data` para la renovacion de certificados.
No utilizar `compose.caddy.yaml` en esta variante.

## Pruebas de aceptacion HTTPS

```bash
curl -I http://motores.example.com/
curl -i https://motores.example.com/api/v1/health
curl -i https://motores.example.com/grafana/api/health
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://motores.example.com/api/v1/dashboard/motors
```

Esperado: redireccion HTTP a HTTPS; salud 200; Grafana health 200;
endpoint protegido sin cookies 401. Verificar certificado CA publica y cadenas
validas, cabeceras HSTS, cookies `Secure; HttpOnly` y CSRF. En el dashboard,
verificar WebSocket `wss://<dominio>/socket.io/` (101 + `session.ready`),
`telemetry.received`, renovacion de sesion, logout y reconexion sin recarga.
Comprobar tambien login de Grafana, dashboards, filtros y rutas `/grafana/`.
La ruta de Grafana queda detras de su propio login; decidir VPN/ACL antes de
exponerla a usuarios externos. No omitir `-f compose.https.yaml` cuando
inspecciones el estado del despliegue HTTPS.

## Reversion

No ejecutar `down -v` ni borrar `caddy_data`/`grafana_data`/`timescaledb_data`.

1. Realizar rollback de los contenedores usando
   `docker compose -f compose.yaml -f compose.docker.yaml up -d --build api web grafana caddy`
   **solo en un ambiente local** al cual quieras retornar, con sus puertos
   de desarrollo disponibles, y posteriormente validar `http://localhost:8080`.
   Volver a compilar `web` es indispensable para restaurar su URL publica HTTP.
2. En un servidor publico, no hacer el rollback a HTTP sin controles de red:
   puede crear una exposicion accidental. Preferir restablecer la configuracion
   HTTPS anterior, o cerrar acceso externo hasta resolver el problema.

## Pendiente para despliegue industrial

Seguridad de dispositivos MQTT remotos (TLS/mTLS), segregacion de redes,
observabilidad, monitoreo de certificados, backups automatizados, gestion de
secretos y politicas de retencion de telemetria. HTTPS solo protege el trayecto
navegador-Caddy: la aplicacion y los dispositivos requieren protecciones propias.
