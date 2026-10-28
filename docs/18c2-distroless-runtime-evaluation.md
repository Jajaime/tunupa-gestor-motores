# Tunupa — 18c2: probar una imagen de ejecución mínima (SIN publicación)

**Estado:** experimento manual y aislado. **No reemplaza los Dockerfiles actuales, no acepta las ocho CVE, no habilita GHCR.**

## Motivo

El preflight 18c1, commit `3e9daf0`, obtuvo 43 hallazgos HIGH por imagen,
correspondientes a ocho CVE de Debian Trixie; el inventario sigue con ocho
revisiones `PENDING`. Las imágenes actuales heredan paquetes y utilidades como
`ncurses`, `util-linux` y `perl-base` de `node:24-trixie-slim`.

En vez de aceptar esos avisos automáticamente, evaluamos **remediación por
reducción real de componentes**: construir la aplicación con Debian Trixie,
conservando Node.js 24 y los módulos nativos, y ejecutar solo con
`gcr.io/distroless/nodejs24-debian13:nonroot`.

Distroless es una alternativa oficial de GoogleContainerTools y utiliza Debian
13 con glibc. **No se garantiza que elimine las ocho CVE** ni que el escáner
identifique todos los componentes. Una CVE ausente puede requerir verificar el
SBOM y la composición exacta de la imagen.

Referencias:
- https://github.com/GoogleContainerTools/distroless
- https://github.com/GoogleContainerTools/distroless/blob/main/nodejs/README.md

## Alcance y ejecución

Nuevos Dockerfiles **experimentales y separados**:
- `apps/api/Dockerfile.distroless-eval`: instala `argon2` en etapa Debian,
  copia solo `node_modules`, `package.json` y `dist` al runtime mínimo.
- `apps/web/Dockerfile.distroless-eval`: copia únicamente el bundle standalone
  Next.js al runtime mínimo.

**Importante:** el contenedor Distroless no tiene shell de ejecución general.
Su ENTRYPOINT ya es Node.js; por eso el CMD contiene solo el archivo JS.
Fijamos UID numérico `1000:1000` para que pueda probarse con los overlays
existentes, que reservan los `tmpfs` para UID 1000. No cambiar estos overlays
hasta probar una migración real.

En GitHub, desde `Actions` ejecutar manualmente **Tunupa - Distroless Runtime
Evaluation (no publish)** seleccionando `main`. Se ejecutan:

1. Auditoría de paquetes npm de ejecución de API y Web.
2. Builds **Debian de referencia** y builds **Distroless experimentales**.
3. Smoke test aislado de hash y verificación `argon2` en API (sin base de datos).
4. Smoke test HTTP de inicio de Next.js (sin acceso al backend).
5. Cuatro escaneos Trivy de vulnerabilidades HIGH/CRITICAL, comparados por ID.
6. Informe Markdown en el resumen de Actions y cuatro JSON como artifact.

El workflow solo concede `contents: read`; no configura `packages: write`, no
sube imágenes a un registro, no utiliza secrets ni modifica el VPS. Los builds
Web **utilizan `https://example.invalid/api/v1` deliberadamente**: no son
adecuados para publicar o desplegar.

La comparación puede devolver un exit code 0 aunque queden CVE o surjan otras:
**es un experimento, no una puerta de liberación**. El resumen explicita tanto
las CVE que desaparecen como las que aparecen. Una falla de build o smoke test
impide considerarlo técnicamente viable.

## Pruebas locales de los validadores (sin Docker)

```bash
python3 -m unittest discover -s scripts/ci -p 'test_compare_runtime_image_cves.py' -v
```

## Criterio para una eventual adopción (etapa futura, NO incluida)

- Comprobar si Trivy refleja una reducción real de paquetes vulnerables y
  ausencia de vulnerabilidades nuevas de severidad alta/crítica.
- Obtener SBOM de Distroless y revisar dependencias de glibc de `argon2`,
  módulo Sharp/Next.js, certificados y DNS.
- Probar un entorno local aislado con TimescaleDB, MQTT, login/CSRF,
  dashboard, Socket.IO, telemetría, históricos y recuperación tras reinicio.
- Validar los controles `cap_drop`, usuario, seccomp, raíz de solo lectura,
  `tmpfs`, memoria, OOM y healthchecks en las imágenes nuevas.
- Rehacer el preflight sobre **el mismo candidato final** de producción con
  URL HTTPS real antes de GHCR, y obtener una decisión humana independiente
  de las vulnerabilidades que permanezcan.

**No modificar `security/release-risk-reviews.json` ni marcar ninguna entrada
`APPROVED_EXCEPTION` basándose solamente en 18c2.**
