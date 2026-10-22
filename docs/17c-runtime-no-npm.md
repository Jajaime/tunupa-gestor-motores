# 17c — Reducir superficie de ataque de imágenes de ejecución

## Diagnóstico verificado

En GitHub Actions del commit `71e00be`, los escaneos de ejecución dieron:

- `npm audit --omit=dev`: **0 vulnerabilidades** en API, Web y Simulador.
- Trivy API y Web: **47 hallazgos HIGH/CRITICAL por imagen**; no son 94 CVE únicas.
- Trivy de infraestructura: **0** HIGH/CRITICAL.

Al inspeccionar los SARIF de las imágenes, se identificaron 12 CVE diferentes.
Las entradas vinculadas a `brace-expansion` (2 CVE) y `undici` (1 CVE) provienen de
`/usr/local/lib/node_modules/npm/node_modules/`, es decir del **npm global de
la imagen oficial Node**, no de las dependencias de ejecución de Tunupa.
Una entrada adicional de `http-cache-semantics` también proviene de npm global,
aunque no indicaba versión corregida en ese reporte.

## Cambio

Eliminar **solo en la etapa runner** el npm global, los enlaces a `npm/npx`
y Corepack si existe. Los `npm ci` y `npm run build` se conservan en las etapas
de compilación. El backend instala primero las dependencias de producción
(`argon2` conserva sus scripts de instalación) y después elimina npm global.
Next.js conserva `standalone` y arranca con `node server.js`.

El cambio NO modifica `node`, las dependencias de `/app`, Caddy, PostgreSQL,
Mosquitto ni los volúmenes. En las imágenes de ejecución no se dispondrá del
CLI `npm`; tareas administrativas que requieran npm deberán realizarse desde
una imagen/herramienta de mantenimiento separada, no instalándolo en producción.

## Validación local (sin recrear los contenedores actuales)

```bash
git apply --check 17c-runtime-no-npm.patch
git apply 17c-runtime-no-npm.patch
git diff --check

docker compose -f compose.yaml -f compose.docker.yaml build --pull api web

# Comprobar que Node sigue disponible y npm global no está instalado.
docker run --rm --entrypoint node tunupa-api:local --version
docker run --rm --entrypoint node tunupa-web:local --version
docker run --rm --entrypoint sh tunupa-api:local -c 'test ! -e /usr/local/lib/node_modules/npm && test ! -e /usr/local/bin/npm'
docker run --rm --entrypoint sh tunupa-web:local -c 'test ! -e /usr/local/lib/node_modules/npm && test ! -e /usr/local/bin/npm'
```

Nota: esto solo construye/inspecciona imágenes. Los contenedores en ejecución
siguen con su imagen previa hasta un `up` explícito. No usar `down -v`.

## Comprobar en GitHub

Tras el commit y push: esperar los 3 workflows. Revisar los artefactos de
`Trivy image - api` y `Trivy image - web` para medir el resultado real.
Se espera reducir las entradas de npm global, pero **no se predice un número
exacto** hasta ejecutar el escáner. Las vulnerabilidades del sistema Debian
que no tienen versiones corregidas requieren evaluación y un mecanismo de
aceptación de riesgos antes de `18-docker-release`.

La etapa DevSecOps actual conserva `exit-code: '0'` para vulnerabilidades.
**Workflow verde no equivale a autorización de publicación**. No desplegar estas
imágenes en el VPS todavía.
