# 17a — Primera corrección de la línea base DevSecOps

## Diagnóstico (ejecución 406f6ce, 21-10-2026)

Los workflows estaban verdes, pero los escaneos de npm y Trivy eran una línea base
informativa, **no un bloqueo de vulnerabilidades**.

- npm audit en dependencias de ejecución: API 0, Web 0, Simulador 1 MODERATE
  (`ip-address`, indirecta, dos avisos GHSA; la herramienta informa solución disponible).
- Trivy SARIF: API 240 resultados y Web 240 resultados; contienen aproximadamente
  60 HIGH, 1 CRITICAL, 94 MEDIUM, 84 LOW y 1 UNKNOWN por imagen. Se repiten
  paquetes del sistema y CVE compartidas entre ambas imágenes.
- Trivy IaC: 2 LOW `DS-0026` por ausencia de HEALTHCHECK en Dockerfile; el
  servicio ya tiene healthcheck en Docker Compose. Revisar contexto, no suprimir
  automáticamente las reglas.
- El CRITICAL `CVE-2023-45853` está asociado a zlib1g; el tracker de Debian
  indica que en bookworm se ignora para `src:zlib` porque el componente MiniZip
  vulnerable no forma parte de los binarios correspondientes. **Evaluar su
  aplicabilidad real antes de considerarlo una exposición explotable**.

## Cambio incluido

1. API y Web cambian **solo la imagen base** de `node:24-bookworm-slim` a
   `node:24-trixie-slim`, en las etapas de build y runner, conservando Node 24.
   Este cambio requiere reconstruir y revalidar; no se aplica automáticamente
   al servidor local.
2. Trivy SARIF respeta `severity: HIGH,CRITICAL` mediante
   `limit-severities-for-sarif: true`. El contador del resumen pasa a representar
   exclusivamente esas severidades; no son errores nuevos sino un cambio en
   el filtrado del reporte. Los niveles menores siguen sujetos a otras revisiones.
3. Se conserva `exit-code: '0'` temporalmente: los problemas existentes todavía
   **no** bloquean la CI. No usar un workflow verde como aprobación de release.

## Validación

```bash
# Validación del parche y los Dockerfiles
git apply --check 17a-security-remediation.patch
git apply 17a-security-remediation.patch
git diff --check

# Construir y probar sin desplegar imágenes nuevas
# Los workflows de GitHub Actions ejecutarán los builds y análisis tras push.
docker compose -f compose.yaml -f compose.docker.yaml build api web
```

No ejecutar `up` de las imágenes modificadas en WSL hasta aprobar pruebas de
compatibilidad y tener rollback a la versión previa. Antes del release, revisar
las nuevas cuentas de Trivy y el estado de las alertas CodeQL.

## Moderada del simulador (siguiente subetapa)

Actualizar lockfile con `npm --prefix apps/simulator audit fix --package-lock-only`
solo después de inspeccionar `npm audit` y confirmar que los nuevos rangos de
versiones son compatibles. Luego ejecutar `npm ci`, `npm test`, `npm run build`
y `npm run typecheck` en `apps/simulator`, y volver a escanear. No usar `--force`.

## No incluido

- No se actualizan contraseñas ni puertos y no se modifica la base de datos.
- No se hace `docker compose up` ni publicación de imágenes.
- No se modifica el código de backend/frontend.
- No se deshabilitan escáneres ni se ignoran CVE sin análisis.
