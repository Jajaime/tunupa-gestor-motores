# 18a4 — Evidencia de exposición de runtime (NO aceptación de riesgos)

## Objetivo

Después de `18a3`, el inventario coincide con Trivy: ocho CVE HIGH conocidas,
43 registros por imagen, sin nuevas CVE ni bloqueantes según el preflight.
Esto **no** significa que se hayan aceptado las ocho CVE.

Esta entrega **no habilita GHCR, no cambia Dockerfiles ni el código de Tunupa,
no modifica workflows y no toca los contenedores en servicio**. Es una herramienta
local para recabar evidencia limitada y contrastarla con el Debian Security Tracker.

## Qué se sabe de las ocho CVE (Debian Trixie, consultar estado de nuevo)

| CVE | Componente / condición de activación descrita por Debian | Comprobación necesaria |
|---|---|---|
| CVE-2025-69720 | `infocmp` (ncurses), desbordamiento al procesar datos | Presencia e invocación de `infocmp` con entrada no fiable |
| CVE-2026-16742 | `systemd-homed`, escalamiento local | Si el daemon afectado existe/se utiliza; `libsystemd0` no equivale a ejecutar homed |
| CVE-2026-54369 | Funciones basadas en rutas de `libacl` ante symlinks | Privilegios del invocador, rutas controlables y uso de ACL |
| CVE-2026-76642 | `mount` y hooks posmontaje tras error de helper | Montajes, capacidades y operaciones con privilegios |
| CVE-2026-78408 | `nsenter --join-cgroup`, descriptor privilegiado | Uso real de `nsenter` y permisos sobre cgroups |
| CVE-2026-78409 | `X-mount.subdir` y enlaces simbólicos | Uso de esa opción, acceso a `fstab` y permisos de montaje |
| CVE-2026-78410 | Bind mounts restringidos y opciones de propiedad | Operaciones `mount` y rutas cambiables por usuarios |
| CVE-2026-9538 | `Archive::Tar` de Perl con tamaños de archivo maliciosos | Si Perl procesa TAR no confiables durante runtime |

Fuentes verificadas el 22-10-2026:
- https://security-tracker.debian.org/tracker/CVE-2025-69720
- https://security-tracker.debian.org/tracker/CVE-2026-16742
- https://security-tracker.debian.org/tracker/CVE-2026-54369
- https://security-tracker.debian.org/tracker/CVE-2026-76642
- https://security-tracker.debian.org/tracker/CVE-2026-78408
- https://security-tracker.debian.org/tracker/CVE-2026-78409
- https://security-tracker.debian.org/tracker/CVE-2026-78410
- https://security-tracker.debian.org/tracker/CVE-2026-9538

En Debian Trixie estos paquetes **siguen marcados como vulnerables** en el
tracker consultado. No se deben mezclar binarios de Debian unstable/testing
con Trixie para resolverlos: podría romper dependencias y perder soporte.

## Ejecución segura de la inspección

Desde la raíz del repositorio, con las imágenes locales ya construidas:

```bash
python3 -m unittest discover -s scripts/security -p 'test_*.py' -v
python3 scripts/security/inspect_runtime_exposure.py --output /tmp/tunupa-runtime-exposure.md
```

El script no inicia API o Web reales ni usa la red del host. Crea instancias
**desechables sin red**, solo lectura, sin capacidades adicionales, únicamente
para comprobar el usuario predeterminado y la presencia de binarios y paquetes.
No solicita secretos ni imprime las variables del entorno de los contenedores.

Puede fallar si las imágenes `tunupa-api:local` o `tunupa-web:local` no están
construidas. En ese caso, `docker compose -f compose.yaml -f compose.docker.yaml
build api web` las construye sin interrumpir los contenedores actuales.

**Límites de la prueba:** ausencia de un ejecutable en `PATH` no demuestra
que ninguna biblioteca vulnerable sea utilizada. La presencia de un binario
no demuestra explotabilidad. El usuario aislado no valida los controles de
Compose aplicados a los procesos reales.

## Confirmar controles en ejecución sin exponer secretos

Ejecutar después de verificar `.env` local y usando los overlays actuales:

```bash
for service in api web; do
  cid=$(docker compose -f compose.yaml -f compose.docker.yaml \
    -f compose.hardening.yaml ps -q "$service")
  test -n "$cid" || exit 1
  docker inspect --format \
    'User={{.Config.User}} CapDrop={{json .HostConfig.CapDrop}} SecurityOpt={{json .HostConfig.SecurityOpt}} PidsLimit={{.HostConfig.PidsLimit}}' "$cid"
done
```

Esperado: usuario `node`, `CapDrop=["ALL"]`,
`SecurityOpt` que incluya `no-new-privileges:true`, `PidsLimit=256`.
No mostrar salida de `docker inspect` completa, que podría incluir secretos.

## Criterio antes de GHCR

1. Confirmar hallazgos sobre la **imagen exacta** para publicar, no solo el tag.
2. Correlacionar las funciones vulnerables con rutas ejecutadas y capacidades
   efectivas de los contenedores bajo carga real.
3. Actualizar el estado de CVE en Debian; reconstruir al publicarse una corrección.
4. Documentar excepciones por CVE con responsable, motivo, mitigación y
   fecha de revisión, o posponer publicación.
5. Si faltan revisiones, **mantener GHCR y despliegue deshabilitados**.

Este documento y cualquier resultado del script son **evidencia preliminar**, no
una declaración de que los ocho riesgos se pueden aceptar.
