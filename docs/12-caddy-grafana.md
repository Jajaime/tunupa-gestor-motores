# 12 — Grafana detrás de Caddy (desarrollo local)

## Alcance

Acceso unificado a `http://localhost:8080/grafana/`, manteniendo la autenticación
propia de Grafana (no equivale a una sesión de usuario Tunupa).

- Caddy reenvía `/grafana/*` a `grafana:3000` sin eliminar el prefijo.
- Grafana recibe `GF_SERVER_ROOT_URL=${WEB_ORIGIN}/grafana/` y
  `GF_SERVER_SERVE_FROM_SUB_PATH=true`, según la configuración oficial para subrutas.
- `/grafana` redirige a `/grafana/`.
- Se mantienen los dashboards y el volumen `grafana_data`; no se cambia TimescaleDB.
- La configuración original en `compose.yaml` mantiene Grafana en
  `127.0.0.1:3001`, pero **su URL canónica pasa a ser la ruta de Caddy**:
  usar `http://localhost:8080/grafana/`; no depender de la URL antigua.
- Solo desarrollo HTTP local: no habilita HTTPS ni acceso público.

## Prerrequisitos

Aplicar y subir a GitHub `10-docker-api-web` antes de este parche.
API, Web, Caddy, Grafana y TimescaleDB deben estar funcionando en Docker.
`.env` debe contener `WEB_ORIGIN=http://localhost:8080` (sin barra final).
No compartir `.env` ni usar `docker compose config` sin `--quiet`.

## Validar y aplicar

```bash
git apply --check 12-caddy-grafana.patch
git apply 12-caddy-grafana.patch
git diff --check

docker compose -f compose.yaml -f compose.docker.yaml config --quiet
docker compose -f compose.yaml -f compose.docker.yaml \
  up -d --no-deps --force-recreate grafana caddy
docker compose -f compose.yaml -f compose.docker.yaml \
  ps grafana caddy
docker compose -f compose.yaml -f compose.docker.yaml \
  logs --tail=40 grafana caddy
```

No ejecutar `docker compose down -v` ni eliminar los volúmenes.

## Pruebas

1. `curl -i http://localhost:8080/grafana/api/health`: código 200 esperado.
2. `curl -I http://localhost:8080/grafana`: redirección 308 a `/grafana/`.
3. Abrir `http://localhost:8080/grafana/`: login **de Grafana**, no el de Tunupa.
4. Acceder con usuario Grafana existente y comprobar paneles técnicos,
   variables de motores/dispositivos y lecturas de TimescaleDB.
5. Navegar de Grafana al dashboard Tunupa (`http://localhost:8080/`),
   verificar login, estado WebSocket y telemetría del simulador.
6. Desde navegador sin sesión Grafana, verificar que paneles privados exigen login;
   el endpoint público de salud no prueba la protección de dashboards.
7. Inspeccionar DevTools > Network para ver que los recursos de Grafana se
   solicitan mediante `/grafana/public/...`, sin errores 404 ni redirecciones
   a `/login` sin prefijo.

Grafana Live (WebSocket) puede utilizar la misma ruta `/grafana/api/live/`;
Caddy gestiona las solicitudes Upgrade automáticamente.

## Reversión del parche

Sin eliminar datos:

```bash
git apply -R 12-caddy-grafana.patch
docker compose -f compose.yaml -f compose.docker.yaml \
  up -d --no-deps --force-recreate grafana caddy
```

Esto devuelve la URL canónica de Grafana a la indicada en `compose.yaml`.
Si ya se confirmó un commit del parche 12, revertir con un commit inverso
apropiado en lugar de `git apply -R`.

## Seguridad pendiente antes de publicar el sistema

- Grafana mantiene `GF_AUTH_ANONYMOUS_ENABLED=false` y registro deshabilitado
  definidos en el Compose base; revisar contraseñas y permisos de usuarios.
- El puerto HTTP de Caddy solo está asociado a `127.0.0.1`.
- **Atención:** el Compose base publica `${POSTGRES_PORT}:5432` sin interfaz
  explícita, lo que puede exponer PostgreSQL fuera de localhost dependiendo
  del host y cortafuegos. Revisar el binding y reglas de red en una entrega
  de endurecimiento; este parche no cambia el puerto de la BD.
- Falta habilitar HTTPS, configurar dominios y cookies Secure para producción.
