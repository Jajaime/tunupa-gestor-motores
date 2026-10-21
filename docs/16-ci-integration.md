# 16 — CI de integración con TimescaleDB efímero

## Objetivo

La comprobación de calidad `15-ci-quality` cubre lint, compilación, Jest y
construcción Docker. Este parche incorpora **otro workflow** llamado
`Tunupa CI - Integration (TimescaleDB)` que comprueba las integraciones reales
con PostgreSQL 16 + TimescaleDB. Ambos workflows se ejecutan en `main`,
`pull_request` y manualmente (`workflow_dispatch`).

## Aislamiento y seguridad

- El servicio de base de datos se crea únicamente en el runner efímero de
  GitHub Actions y desaparece al terminar el job.
- `POSTGRES_USER`, `POSTGRES_DB` y contraseña son valores ficticios y exclusivos
  de la instancia temporal. No se usan GitHub Secrets, `.env` ni el VPS.
- El script `scripts/ci/apply-test-migrations.sh` se niega a ejecutarse salvo
  que `GITHUB_ACTIONS=true`, host `127.0.0.1`, usuario y base `tunupa_ci`.
- Solo existe permiso `contents: read` para el token de CI.
- No hay despliegue, creación de usuarios de producción ni publicación de
  imágenes. Los tests usan transacciones y la base es desechable.

## Qué ejecuta

1. Inicia `timescale/timescaledb:latest-pg16` con healthcheck.
2. Instala Node 24 y las dependencias bloqueadas de `apps/api` y
   `apps/simulator` mediante `npm ci`.
3. Aplica **todos** los SQL `database/migrations/*.up.sql` en orden numérico.
   Verifica extensión `timescaledb`, hypertable `telemetry` y tablas de
   autenticación e ingesta. Esta ruta de CI comprueba los SQL, no el registro
   de checksums del migrador `scripts/database/migrate.sh`.
4. Ejecuta `test:telemetry` (duplicados, alarmas y recuperación),
   `test:realtime` (sesión HTTP, WebSocket, rotación, expiración y logout),
   `test:events` (eventos confirmados y watchdog).

No ejecutamos el simulador continuo ni necesitamos un broker MQTT para estas
pruebas: los tests utilizan los escenarios compilados y servicios reales de
API/TimescaleDB. La prueba de extremo a extremo del consumidor MQTT quedará
para una fase posterior.

## Aplicación

```bash
git apply --check 16-ci-integration.patch
git apply 16-ci-integration.patch
git diff --check
git status --short
```

Esperar tres archivos nuevos. Preparar commit **solo** si `git apply` fue OK:

```bash
git add .github/workflows/ci-integration.yml \
  scripts/ci/apply-test-migrations.sh docs/16-ci-integration.md
git diff --cached --check
git commit -m "ci: test telemetry and websocket with ephemeral TimescaleDB"
git push
```

## Aceptación

Abrir GitHub → Actions → **Tunupa CI - Integration (TimescaleDB)**.
El job `API - telemetry, realtime and events (DB)` debe estar verde. El
workflow de calidad existente debe continuar en verde también. Si falla,
compartir solamente el **nombre del paso** y el error sin valores de `.env`.

## Mantenimiento

- El tag `latest-pg16` coincide con el Compose actual, pero es flotante:
  conviene fijar una versión/digest cuando se estabilice el despliegue.
- Añadir nuevas migraciones `.up.sql` al directorio hará que CI las aplique
  automáticamente, antes de correr las pruebas.
- Nunca ejecutar el script de CI sobre una base con datos existentes.
