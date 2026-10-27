# 18b2 — Bloquear nuevas vulnerabilidades npm de ejecución

## Antecedentes

Tras los commits `5e94e7c` y `0348693`, las dependencias npm de ejecución de
API, Web y Simulador quedaron sin avisos en `npm audit --omit=dev` (ejecución
`40391441192`). El pipeline DevSecOps continuaba **verde incluso si una
nueva vulnerabilidad npm era detectada**, porque `security_report.py` era
solo informativo. Esto impedía usar el resultado como control bloqueante.

## Cambio

- `scripts/ci/security_report.py` devuelve error cuando el resumen npm contiene
  una o más vulnerabilidades, independientemente de su severidad.
- Conserva el resumen de GitHub Actions y el archivo JSON de auditoría: el paso
  `Save audit report` ya usa `if: always()`.
- Los análisis Trivy de imágenes Debian **no cambian**: siguen siendo línea
  base informativa de las CVE HIGH conocidas. El inventario y la aprobación
  humana continúan siendo requisitos separados antes de GHCR.
- No se introducen permisos `packages: write` ni se publica ninguna imagen.

## Validación

```bash
python3 -m unittest discover -s scripts/ci -p 'test_security_report.py' -v
git diff --check
```

Tras el push, revisar `Tunupa CI - DevSecOps Scanning`. Deben pasar los tres
jobs npm si no hay vulnerabilidades de ejecución y los dos escaneos de imagen
seguirán publicando sus informes SARIF. Luego ejecutar manualmente
`Tunupa - Release Candidate Preflight (no publish)` sobre `main` para evaluar
el estado actual de Trivy e inventario. Si aparecen CVE nuevas o una HIGH con
versión corregida, **detener la publicación y revisar el caso**.

## Limitación

Esta puerta usa `npm audit --omit=dev`: no sustituye el análisis de paquetes
Debian, dependencias de desarrollo, CodeQL, SBOM ni la revisión del runtime.
El resultado del workflow no implica aprobación de ninguna excepción.
