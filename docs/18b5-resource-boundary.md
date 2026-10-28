# Tunupa — 18b5: limites de memoria opcionales (API y Web)

**Estado:** configuracion experimental/local; NO acepta las ocho CVE y NO habilita GHCR.

## Razon del cambio

En 18b4 ambos procesos Node estaban sin capacidades adicionales, UID 1000,
`NoNewPrivs=1`, `Seccomp=2` y sin bibliotecas afectadas observadas en memoria,
pero `HostConfig.Memory=0`: no habia un limite de memoria de Docker.
Un limite puede aislar mejor fallas de agotamiento de recursos (incluyendo
escenarios DoS), pero **no corrige** `CVE-2026-9538` ni prueba que `Archive::Tar`
se use o sea inalcanzable. Puede provocar que Docker mate el contenedor por OOM.

## Politica y alcance

`compose.resources.yaml` es un overlay **opcional**: limite inicial de
768 MiB en `api` y 768 MiB en `web`; son valores de partida para el beta de
un motor, **no medidas obtenidas de pruebas de carga**. Antes de usarlos en
un VPS, evaluar consumo real y margen de crecimiento. No altera TimescaleDB,
Mosquitto, Caddy, Grafana ni las imagenes.

No se fija `memswap_limit`: la configuracion de swap depende del host; este
parche limita RAM, **no asegura un maximo de memoria + swap**. No desactivar
`oom_kill` ni elevar privilegios para cumplir la verificacion.

## Aplicacion y validacion en WSL

Desde la raiz del repositorio:

```bash
python3 -m unittest discover -s scripts/security -p 'test_verify_memory_limits.py' -v
# Capturar referencia del consumo previo, mientras corre telemetria normal:
docker stats --no-stream tunupa-gestor-motores-api-1 tunupa-gestor-motores-web-1
# Comprobar sintaxis:
docker compose -f compose.yaml -f compose.docker.yaml -f compose.hardening.yaml \
  -f compose.readonly.yaml -f compose.resources.yaml config --quiet
```

Construir las imagenes locales con las dependencias npm ya corregidas, sin
interrumpir el servicio actual:

```bash
docker compose -f compose.yaml -f compose.docker.yaml build --pull api web
```

Detener temporalmente el simulador, si esta enviando mensajes MQTT, y recrear
solo API y Web (breve interrupcion de dashboard; la telemetria perdida durante
este intervalo no se recupera de forma automatica):

```bash
docker compose -f compose.yaml -f compose.docker.yaml -f compose.hardening.yaml \
  -f compose.readonly.yaml -f compose.resources.yaml \
  up -d --no-deps --force-recreate api web
```

Esperar a que ambos servicios esten healthy:

```bash
docker compose -f compose.yaml -f compose.docker.yaml -f compose.hardening.yaml \
  -f compose.readonly.yaml -f compose.resources.yaml ps api web
python3 scripts/security/verify_memory_limits.py
docker stats --no-stream tunupa-gestor-motores-api-1 tunupa-gestor-motores-web-1
python3 scripts/security/check_live_cve_conditions.py --output /tmp/tunupa-cve-live-conditions-18b5.md
```

Reactivar el simulador y validar login, cookies/CSRF, dashboard, WebSocket,
telemetria normal, historicos, y cambios de estado; observar el consumo bajo
carga real, OOM o reinicios. `OOMKilled=false` tras una sola inspeccion no
garantiza estabilidad futura. Registrar limite apropiado despues de medir.

## Reversion inmediata (preserva endurecimiento y solo lectura)

```bash
docker compose -f compose.yaml -f compose.docker.yaml -f compose.hardening.yaml \
  -f compose.readonly.yaml up -d --no-deps --force-recreate api web
```

Comprobar `docker compose ps api web` y repetir smoke tests. La reversion no
cambia base de datos ni elimina volumenes. No utilizar `down -v`.

## Pendientes para una liberacion

- Conservar `security/release-risk-reviews.json` con ocho CVE en `PENDING`
  hasta evaluacion y decision humana verificable.
- Observar recursos durante una sesion prolongada con un motor antes de elegir
  limites definitivos en VPS; revisar cgroups/swap del host de despliegue.
- Preflight GitHub construye imagenes separadas con `example.invalid`; ni este
  overlay ni los resultados locales las aprueban para GHCR.
