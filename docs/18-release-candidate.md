# 18a — Candidato de release: build + auditoria (sin publicacion)

## Objetivo

Incorporar un primer paso seguro hacia GHCR, independiente del VPS y del dominio.
El workflow `.github/workflows/release-candidate.yml` se ejecuta **solo manualmente**,
solo en `main`, construye las imagenes actuales de API y Web, comprueba `npm audit`
de ejecucion de los tres proyectos y escanea **esas mismas imagenes** con Trivy.

**No publica imagenes**, no inicia sesion en GHCR, no tiene `packages: write`, no
activa HTTPS y no afecta los contenedores locales ni el futuro servidor.

Next.js incorpora `NEXT_PUBLIC_API_URL` durante el build. Este candidato emplea
`https://example.invalid/api/v1`: **no se debe desplegar esa imagen**. La futura
publicacion debera recompilar la imagen Web con el dominio HTTPS real.

## Politica preliminar del preflight

- `npm audit --omit=dev --audit-level=low` bloquea todas las vulnerabilidades npm
  de produccion conocidas y detectadas por esa herramienta.
- Trivy genera reportes JSON completos para severidades `HIGH,CRITICAL`.
- El evaluador `scripts/ci/release_scan_gate.py` falla si hay cualquier CRITICAL
  o HIGH con version corregida informada por Trivy.
- Las HIGH sin version corregida *no hacen fallar esta prueba preparatoria*:
  quedan enumeradas como riesgos pendientes. **No equivalen a excepciones
  aprobadas.** Antes de publicar GHCR, cada familia de CVE debe clasificarse
  por explotabilidad/alcance; los riesgos residuales necesitan aceptacion
  explicita. Un informe en verde no permite automaticamente un release.
- No se suprimen ni ignoran CVE en la auditoria.
- Esta politica es un punto de partida para la futura etapa 18b, no un
  veredicto integral de seguridad (no cubre ataques de cadena de suministro,
  secrets en el repositorio, dinamica del runtime ni todas las configuraciones).

## Baseline del 22-10-2026, commit 8bf205b

Trivy registro 43 coincidencias HIGH por imagen, correspondientes a 8 CVE
unicas en paquetes Debian Trixie. **El SARIF consultado no informa version
corregida** para ninguna de ellas. Los paquetes se repiten porque las CVE
impactan varias librerias y herramientas provenientes de los mismos paquetes
fuente. Los ocho identificadores detectados fueron:

`CVE-2026-76642`, `CVE-2026-78408`, `CVE-2026-78409`, `CVE-2026-78410`,
`CVE-2026-54369`, `CVE-2026-16742`, `CVE-2025-69720`, `CVE-2026-9538`.

Actualizar imagenes puede alterar el resultado. El JSON de Trivy recien
obtenido siempre prevalece sobre esta fotografia historica.

## Ejecucion y revision

1. Guardar el parche 18a en la raiz; validar con `git apply --check` y aplicar.
2. Validar formato con `git diff --check` y preparar commit solo de los archivos
   propios de esta etapa; realizar push.
3. Abrir **Actions > Tunupa - Release Candidate Preflight (no publish)** y usar
   **Run workflow** en `main`.
4. Verificar que `npm audit`, builds y Trivy terminan. Leer el **Job Summary**
   con CVE pendientes. Revisar artefactos JSON en la ejecucion.
5. No publicar ni desplegar estas imagenes; esperar etapa 18b con dominio real,
   control de aprobacion, permisos `packages: write` limitados, imagenes con
   etiquetas por SHA/digest, reportes SBOM y atestacion de procedencia.

## Reversion

Eliminar solo los archivos nuevos de esta entrega y hacer commit inverso. No
requiere reiniciar Docker ni restaurar datos.
