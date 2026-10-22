# 18a5 — Filesystem de solo lectura en API/Web (optativo)

## Motivo y alcance

El informe 18a4 de Tunupa identificó `USER node` (UID 1000), CapDrop `ALL`,
`no-new-privileges:true` y límite de procesos de 256. También observó los
binarios `infocmp`, `mount`, `nsenter`, `umount` y `perl` en ambas imágenes.

Este overlay **no elimina ni corrige** las CVE pendientes, pero añade otra
restricción a la ejecución: todo el filesystem raíz queda en solo lectura;
solo `/tmp` y, para Web, `/app/.next/cache` quedan como espacios temporales.
La caché de Next.js desaparece al recrear el contenedor, por diseño. Puede
incrementar el trabajo de optimización posterior al reinicio.

- Combinar `compose.readonly.yaml` **después** de `compose.hardening.yaml`.
- No se aplica a PostgreSQL, Mosquitto, Caddy ni Grafana.
- No se alteran Dockerfiles, esquemas, volúmenes ni secretos.
- `/tmp` tiene tope 64 MiB por servicio; Web recibe además 128 MiB para
  `.next/cache`. tmpfs utiliza memoria del host/contendor y no persiste.
- `nosuid,nodev,noexec` reduce usos accidentales de esas rutas, y
  `uid=1000,gid=1000` sigue el usuario `node` de las imágenes.
- **No usar este overlay en producción sin validar cargas y caché reales.**

## Paso 1 — cerrar primero 18a4

Confirmar commit/push de `18a4-runtime-exposure-review` antes de aplicar 18a5.
Los datos de 18a4 documentan imágenes **locales** por digest; una reconstrucción
no reutiliza automáticamente esa evidencia.

## Paso 2 — pruebas sin interrupción

```bash
python3 -m unittest discover -s scripts/security \
  -p 'test_verify_readonly_runtime.py' -v

docker compose -f compose.yaml -f compose.docker.yaml \
  -f compose.hardening.yaml -f compose.readonly.yaml config --quiet

# Revisión de configuración efectiva sin volcar variables sensibles:
docker compose -f compose.yaml -f compose.docker.yaml \
  -f compose.hardening.yaml -f compose.readonly.yaml config --format json | \
  python3 -c 'import json,sys; s=json.load(sys.stdin)["services"]; assert all(s[n]["read_only"] for n in ("api", "web")); print("OK: rootfs de API/Web de solo lectura")'
```

## Paso 3 — prueba controlada con recreación

**ATENCIÓN: interrumpe brevemente API/Web y puede provocar pérdida de mensajes
MQTT no retenidos.** Verificar previamente el respaldo de datos, y detener el
simulador mientras se recrean los dos servicios. No usar `down -v`.

```bash
docker compose -f compose.yaml -f compose.docker.yaml \
  -f compose.hardening.yaml -f compose.readonly.yaml \
  up -d --no-deps --force-recreate api web

docker compose -f compose.yaml -f compose.docker.yaml \
  -f compose.hardening.yaml -f compose.readonly.yaml ps api web

python3 scripts/security/verify_readonly_runtime.py
```

Probar obligatoriamente login/logout, CSRF, estado HTTP `/api/v1/health`,
401 anónimo en endpoint protegido, reconexión WebSocket y datos MQTT normales.
Para Web, recorrer también páginas del dashboard y cualquier ruta que use
`next/image`, ISR o caché. Observar logs y métricas de memoria tmpfs:

```bash
docker compose -f compose.yaml -f compose.docker.yaml \
  -f compose.hardening.yaml -f compose.readonly.yaml \
  logs --tail=60 api web
```

Revisar especialmente `EROFS`, `EACCES`, `ENOSPC`, caché, o problemas con
módulos nativos. No publicar si aparece alguno. El script de inspección
no demuestra que las pruebas funcionales anteriores sean exitosas.

## Reversión rápida, sin borrar datos

Recrear solamente API/Web SIN el overlay de solo lectura; conservar el
endurecimiento 18a2:

```bash
docker compose -f compose.yaml -f compose.docker.yaml \
  -f compose.hardening.yaml \
  up -d --no-deps --force-recreate api web
```

No ejecutar `docker compose down -v` ni eliminar volúmenes PostgreSQL.

## Puerta de publicación GHCR

Los escaneos Trivy siguen siendo necesarios sobre los bytes exactos de las
imágenes que se publicarían. La restricción de solo lectura **no** aprueba
ninguna CVE. Se requiere aceptación explícita de los riesgos HIGH residuales
antes de un release destinado a despliegue. Además, la Web final debe construirse
con `NEXT_PUBLIC_API_URL` HTTPS real, no con `example.invalid`.
