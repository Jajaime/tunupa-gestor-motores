# Tunupa — 18c3: ensayo funcional local con runtime Distroless

**Solo laboratorio WSL/Docker.** No publica en GHCR, no acepta CVE y no
modifica los Dockerfiles Debian originales.

## Objetivo y condición de partida

La evaluación GitHub Actions 18c2 (commit `dbdd7fa`, ejecución manual #1)
identificó 43 HIGH / 8 CVE distintas por imagen Debian, y 0 HIGH/CRITICAL
observadas por Trivy en API y Web Distroless. Pasaron pruebas aisladas de
`argon2` y HTTP inicial Next.js. **No prueban login, sesión, MQTT, DB ni
Socket.IO**. Validar aquí el circuito completo contra la infraestructura local
antes de decidir cambiar las imágenes predeterminadas.

El overlay `compose.distroless-eval.yaml` reemplaza únicamente los Dockerfiles,
los tags y los healthchecks de API/Web. Los tags alternativos permiten regresar
a la imagen Debian anterior. **La prueba sí recrea API y Web**; exige una breve
interrupción. TimescaleDB, Mosquitto, Grafana y sus volúmenes no se recrean,
pero la API experimental se conectará a la **misma base y broker reales** y
puede persistir nuevas mediciones. No es un entorno de datos completamente aislado.

Distroless no contiene shell general ni un `node` habitual en PATH. El
healthcheck emplea `/nodejs/bin/node`. Los Dockerfiles experimentales usan
`USER 1000:1000`; el script Debian anterior exigía el literal `node`.
**Usar el verificador de 18c3 para este ensayo, no rebajar controles.**

## Aplicar (en la raíz del proyecto)

```bash
python3 -m unittest discover -s scripts/security -p 'test_verify_distroless_integration.py' -v

COMPOSE_FILES=(
  -f compose.yaml
  -f compose.docker.yaml
  -f compose.hardening.yaml
  -f compose.readonly.yaml
  -f compose.resources.yaml
  -f compose.distroless-eval.yaml
)
docker compose "${COMPOSE_FILES[@]}" config --quiet
```

Asegurar que `WEB_ORIGIN` y la configuración actual `.env` son las habituales
para el laboratorio local. **No cambiar a `example.invalid`**: el bundle de
Next.js incorpora el URL público al compilar.

Construir los tags alternativos **sin detener aún los servicios actuales**:

```bash
docker compose "${COMPOSE_FILES[@]}" build --pull api web
```

Desde la terminal del simulador: detenerlo temporalmente con Ctrl+C. Se perderá
telemetría generada durante el breve reinicio (no repetir ni modificar datos
manualmente). Luego iniciar solo los contenedores nuevos:

```bash
docker compose "${COMPOSE_FILES[@]}" up -d --no-deps --force-recreate api web
docker compose "${COMPOSE_FILES[@]}" ps api web
python3 scripts/security/verify_distroless_integration.py
```

**Si fallan los healthchecks, no considerar Distroless validado.** Consultar
logs limitados sin mostrar secretos y hacer rollback antes de más cambios:

```bash
docker compose "${COMPOSE_FILES[@]}" logs --tail=80 api web
```

Reactivar el simulador normal y comprobar por Caddy (habitualmente
`http://localhost:8080`): login/CSRF, listado de motores, telemetría MQTT,
gráficas, histórico, WebSocket en vivo, pérdida/reconexión y logout. Confirmar
que los límites de memoria y la raíz de solo lectura siguen activos:

```bash
python3 scripts/security/verify_memory_limits.py
docker stats --no-stream tunupa-gestor-motores-api-1 tunupa-gestor-motores-web-1
```

**Nota:** `verify_memory_limits.py` usa los mismos nombres de proyecto y
servicio y consulta las restricciones efectivas, aunque no necesita el overlay
Distroless para ubicar sus contenedores. `verify_readonly_runtime.py` y
`check_live_cve_conditions.py` aún exigen `Config.User=node` y pueden
reportar un falso incumplimiento en el ensayo numérico; el validador 18c3
verifica expresamente el usuario `1000:1000`.

## Reversión inmediata (sin borrar datos)

En la raíz, detener temporalmente el simulador si está activo. **Omitir** el
overlay `compose.distroless-eval.yaml` al restaurar:

```bash
ROLLBACK_FILES=(
  -f compose.yaml
  -f compose.docker.yaml
  -f compose.hardening.yaml
  -f compose.readonly.yaml
  -f compose.resources.yaml
)
docker compose "${ROLLBACK_FILES[@]}" up -d --no-deps --force-recreate api web
docker compose "${ROLLBACK_FILES[@]}" ps api web
python3 scripts/security/verify_memory_limits.py
```

Los tags `tunupa-api:local` y `tunupa-web:local` se conservan al construir
Distroless con tags alternativos. Si se borraron, reconstruir previamente con
`docker compose "${ROLLBACK_FILES[@]}" build api web`.
**Nunca ejecutar `down -v` para revertir este ensayo.**

## Criterios de adopción (posteriores, no automáticos)

1. CI y smoke tests completos + pruebas locales integradas sin regresiones.
2. Nuevo SBOM CycloneDX Distroless y nueva inspección Trivy de **las imágenes
   exactas que se pretenda publicar**, con versiones y referencias trazables.
3. Revisión de componentes nativos `argon2` y Sharp y de rutas DNS/TLS,
   cookies HTTPS y estabilidad bajo telemetría real.
4. Documentar la razón de los hallazgos ausentes en el baseline Debian; no
   eliminar CVE históricas del registro ni crear excepciones solo porque Trivy
   no las detecta en la nueva imagen.
5. Definir dominio HTTPS real y permisos de publicación solo después de
   revisar todos los controles de GHCR y el host de destino.

**Estado:** NO PUBLICAR, NO DESPLEGAR VPS, CVE del runtime Debian pendientes.
