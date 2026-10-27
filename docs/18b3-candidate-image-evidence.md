# 18b3 — Evidencia verificable de imágenes candidatas (sin publicar)

## Objetivo

Ampliar el preflight manual `Tunupa - Release Candidate Preflight (no publish)`
para generar evidencia de **las mismas imágenes locales** escaneadas, sin
publicarlas. No cambia aplicaciones, Dockerfiles, bases de datos o credenciales.
No crea un workflow de GHCR y no otorga aceptación de riesgos CVE.

## Evidencia generada por la ejecución manual

Después de construir `tunupa-api:release-candidate` y
`tunupa-web:release-candidate`, el workflow:

1. Inspecciona cada imagen con `scripts/security/inspect_runtime_exposure.py`,
   en un contenedor desechable sin red, solo lectura y sin capacidades adicionales.
   Guarda el resultado en `runtime-exposure-release.md`.
2. Ejecuta Trivy en ambas imágenes, generando los JSON de vulnerabilidades
   `trivy-release-api.json` y `trivy-release-web.json` (HIGH/CRITICAL).
3. Genera SBOM de **cada imagen** en formato CycloneDX:
   `sbom-release-api.cdx.json` y `sbom-release-web.cdx.json`.
   Los SBOM representan componentes instalados; **no sustituyen** los escaneos
   de vulnerabilidades JSON. Consultar documentación Trivy: https://trivy.dev/docs/
4. Ejecuta `scripts/ci/candidate_evidence.py`: valida que `Metadata.ImageID`
   de Trivy y el ID del reporte runtime sean idénticos a `docker image inspect`.
   También comprueba estructura mínima CycloneDX y nombre de imagen.
5. Produce `candidate-evidence.json`: SHA del commit, ID local de configuración
   de cada imagen, SHA256 de Trivy, SBOM y reporte runtime, número de
   componentes SBOM y estado `publication_authorized: false`.
6. Adjunta los **seis archivos** en un único artifact de GitHub Actions durante
   14 días: `tunupa-release-candidate-evidence-<SHA>`.

## Límites y seguridad

- **`image_config_id` NO es el digest de manifiesto OCI que entrega GHCR.**
  Todavía no hay digest del registro, ni firma, ni attestation ni procedencia
  verificable de una imagen publicada. El control comprueba coherencia entre
  artefactos dentro de la misma ejecución de CI, no la identidad de una futura
  reconstrucción independiente.
- Se mantiene deliberadamente el build arg
  `NEXT_PUBLIC_API_URL=https://example.invalid/api/v1`. Estas imágenes son
  **solo para auditoría**: el frontend así construido no se puede desplegar.
  El release definitivo requiere origen HTTPS real y volver a evaluar la imagen
  exacta que se publicará, sin reconstrucción posterior al escaneo.
- El reporte runtime constata paquetes y ejecutables, no llamadas reales,
  explotación de vulnerabilidades ni configuración efectiva del futuro VPS.
- El workflow sigue con `permissions: contents: read`, sin GHCR, login,
  `packages: write`, environment ni secretos.
- Las ocho CVE pendientes continúan `PENDING`. El preflight NO concede
  `APPROVED_EXCEPTION` ni autoriza publicar o desplegar.
- Los artefactos tienen retención de 14 días. Para auditoría de largo plazo,
  conservar de manera segura los expedientes aprobados y digest de release,
  cuando esos hitos existan.

## Prueba local sin Docker

```bash
python3 -m unittest discover -s scripts/ci -p 'test_candidate_evidence.py' -v
python3 -m unittest discover -s scripts/security -p 'test_*.py' -v
git diff --check
```

Resultados previstos: 8 pruebas nuevas y pruebas existentes de inspección.

## Verificación manual GitHub Actions

Tras el push:

1. Confirmar los tres CI automáticos verdes.
2. GitHub Actions → `Tunupa - Release Candidate Preflight (no publish)` → Run workflow en `main`.
3. Revisar paso `Validate image identity and prepare evidence manifest`:
   debe indicar **OK**, con coincidencia exacta de IDs. Revisar paso de SBOM.
4. Descargar el artifact; deben aparecer los **seis archivos** indicados.
5. El resumen `GHCR` debe continuar **NO AUTORIZADO** mientras las ocho
   evaluaciones estén pendientes, aunque el workflow finalice verde.

El análisis de CVE y la aprobación humana del entorno `ghcr-publish` siguen
siendo los próximos prerrequisitos para publicar imágenes reales.
