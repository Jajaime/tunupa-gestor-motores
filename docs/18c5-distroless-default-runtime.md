# Tunupa 18c5 — Promoción local de Distroless como runtime predeterminado

**No habilita GHCR, no publica imágenes ni aprueba automáticamente CVE.**

## Justificación y precondiciones

- 18c4, `9fe05f1`: Quality, Integration, DevSecOps y Distroless Candidate Preflight #1 aprobaron. Trivy informó 0 HIGH/CRITICAL en ambas imágenes Distroless, con 330 componentes API y 35 Web en SBOM.
- En 18c3 los contenedores Distroless locales levantaron healthy con rootfs de solo lectura, UID 1000, CapDrop ALL, no-new-privileges y 768 MiB. **El reporte aportado no registra expresamente las seis pruebas manuales end-to-end** (login, CSRF, telemetría MQTT, histórico, WebSocket/reconexión, logout); deben verificarse antes de adoptar definitivamente.
- Ningún resultado anterior prueba ausencia total de vulnerabilidades ni confirma seguridad del VPS.

## Cambios

- Los Dockerfiles estándar de API y Web pasan a compilar y ejecutar con Distroless Node 24 Debian 13, reutilizando el experimento validado, con `USER 1000:1000` y entrada Node absoluta interna a la imagen.
- Se conservan los Dockerfiles originales como `Dockerfile.debian-rollback`, y se agrega `compose.debian-rollback.yaml` para volver a ellos sin borrar volúmenes.
- `compose.docker.yaml` emplea `/nodejs/bin/node` en los healthchecks. Los overlays `hardening`, `readonly` y `resources` **se conservan obligatorios** para la ejecución probada.
- El workflow de candidato general ahora inspecciona las imágenes con el inspector Distroless (`/bin/sh`/`dpkg-query` no existen en ese runtime). Sigue usando `example.invalid`, así que **no puede desplegarse**. La evaluación conserva Trivy, SBOM e identidad de imagen.
- El workflow antiguo de comparación Distroless vs Debian sigue siendo histórico; el preflight independiente Distroless queda como comparación adicional. Scripts legacy que asumen `Config.User=node` son para Debian y no deben usarse para validar el runtime predeterminado.

## Verificaciones previas (sin reiniciar)

```bash
python3 -m unittest discover -s scripts/ci -p 'test_distroless_promotion.py' -v
COMPOSE_FILES=(-f compose.yaml -f compose.docker.yaml -f compose.hardening.yaml -f compose.readonly.yaml -f compose.resources.yaml)
docker compose "${COMPOSE_FILES[@]}" config --quiet
docker compose "${COMPOSE_FILES[@]}" build --pull api web
```

**Importante:** si el entorno sigue ejecutando `compose.distroless-eval.yaml`, el `build` estándar **no lo recrea**. Antes de cambiar de runtime, detén temporalmente el simulador; el cambio de API puede interrumpir telemetría durante la recreación.

## Cambiar a runtime predeterminado (datos y volúmenes preservados)

```bash
docker compose "${COMPOSE_FILES[@]}" up -d --no-deps --force-recreate api web
docker compose "${COMPOSE_FILES[@]}" ps api web
python3 scripts/security/verify_memory_limits.py
# Verificación directa del runtime predeterminado Distroless (sin overlay experimental):
docker inspect --format 'service={{.Name}} user={{.Config.User}} readonly={{.HostConfig.ReadonlyRootfs}} memory={{.HostConfig.Memory}} status={{.State.Health.Status}}'   tunupa-gestor-motores-api-1 tunupa-gestor-motores-web-1
```

Esperado: User `1000:1000`, `readonly=true`, `memory=805306368`, `healthy` en ambos. Validar login y cierre de sesión, cookies/CSRF, dashboard, telemetría MQTT, histórico, WebSocket y reconexión sin recargar; revisar logs si falla algo.

## Reversión a Debian (sin borrar datos)

```bash
ROLLBACK_FILES=(-f compose.yaml -f compose.docker.yaml -f compose.hardening.yaml -f compose.readonly.yaml -f compose.resources.yaml -f compose.debian-rollback.yaml)
docker compose "${ROLLBACK_FILES[@]}" config --quiet
docker compose "${ROLLBACK_FILES[@]}" build api web
# Detener temporalmente el simulador MQTT antes de recrear:
docker compose "${ROLLBACK_FILES[@]}" up -d --no-deps --force-recreate api web
docker compose "${ROLLBACK_FILES[@]}" ps api web
```

El overlay de rollback restituye healthchecks usando `node` y tags `:debian-rollback-local`. **NO ejecutar `down -v`**.

Para regresar luego a Distroless, utilizar `COMPOSE_FILES` sin el overlay Debian y repetir `up --force-recreate api web`.

## Verificación en CI antes de publicar

1. Confirmar Quality, Integration y DevSecOps en el commit de promoción.
2. Ejecutar manualmente `Tunupa - Release Candidate Preflight (no publish)`. Debe usar el inspector Distroless y generar seis archivos de evidencia en un artefacto, con cero HIGH/CRITICAL si el resultado 18c4 se mantiene.
3. Comparar el contenido del SBOM: verificación de componentes vulnerables removidos frente al Debian anterior. No borrar `security/pending-high-cves.json` ni falsificar una aceptación de riesgo.
4. Antes de GHCR: configurar dominio HTTPS real, cookies seguras/Caddy, VPS y permisos; construir y escanear **los bytes exactos del candidato final** y requerir aprobación humana independiente.

Este cambio no toca esquema de datos, telemetría, roles, credenciales, ni volúmenes PostgreSQL/MQTT.
