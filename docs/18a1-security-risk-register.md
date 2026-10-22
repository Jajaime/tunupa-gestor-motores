# 18a1 — Actualización de acciones y registro preliminar de riesgos

## Alcance

- Se cambia `actions/upload-artifact` a `v7.0.2`, fijado por commit SHA,
  en los workflows de seguridad y release candidate. La acción utiliza el
  runtime Node.js 24. El resto de las acciones y los procesos de la aplicación
  permanecen intactos.
- No se habilita GHCR, no se amplían permisos de GitHub Actions, no se
  alteran Dockerfiles ni se despliega a servidores.
- El aviso anterior de Node.js 20 no implicaba una falla de la aplicación;
  era una advertencia sobre el runtime de una acción de GitHub.

## Resultado observado del release candidate 18a

Fuente: ejecución manual proporcionada por el responsable del repositorio:
`https://github.com/Jajaime/tunupa-gestor-motores/actions/runs/39779568560`.

| Categoría | API | Web |
|---|---:|---:|
| CRITICAL o HIGH con versión corregida indicada por Trivy | 0 | 0 |
| HIGH sin versión corregida indicada por Trivy | 43 | 43 |

Las 86 coincidencias suman hallazgos de dos imágenes que comparten la base
Debian Trixie. **No representan 86 CVE diferentes**. Existen ocho identificadores
CVE reportados en cada imagen:

| CVE | Paquetes indicados por el informe | Evaluación pendiente |
|---|---|---|
| CVE-2025-69720 | libtinfo6, ncurses-base, ncurses-bin | Verificar exposición del paquete en el proceso Node |
| CVE-2026-16742 | libsystemd0, libudev1 | Verificar si se utiliza el componente afectado por el advisory |
| CVE-2026-54369 | libacl1 | Evaluar vector explotable y alcance en contenedor |
| CVE-2026-76642 | util-linux y librerías relacionadas | Evaluar operaciones mount/capabilities; Debian trixie lo registra vulnerable |
| CVE-2026-78408 | util-linux y librerías relacionadas | Evaluar operaciones privilegiadas |
| CVE-2026-78409 | util-linux y librerías relacionadas | Evaluar opciones mount afectadas |
| CVE-2026-78410 | util-linux y librerías relacionadas | Evaluar opciones mount afectadas |
| CVE-2026-9538 | perl-base | Verificar uso de componentes Perl en tiempo de ejecución |

Los cuatro CVE de `util-linux` se propagan a varios paquetes binarios: bsdutils,
libblkid1, liblastlog2-2, libmount1, libsmartcols1, libuuid1, login, mount y
util-linux. La ausencia de `FixedVersion` en el JSON de Trivy **no certifica
que no exista parche en ninguna distribución, que el riesgo sea aceptable o
que el contenedor no sea explotable**.

Consultas oficiales recomendadas para actualizar la clasificación:
- Debian Security Tracker: `https://security-tracker.debian.org/tracker/source-package/util-linux`
- Debian Security Tracker: `https://security-tracker.debian.org/tracker/source-package/systemd`
- SARIF/JSON Trivy de la ejecución recién analizada, no únicamente un listado histórico

## Política de aprobación para el paso 18b

**Estado: pendiente de revisión / NO aprobado para publicación.**

Antes de incorporar `packages: write` y publicar imágenes en GHCR:

1. Analizar cada familia CVE, distinguendo librería instalada del componente
   efectivamente utilizado, capacidades Linux, usuario del proceso, privilegios,
   rutas de ataque, exposición de red y actualizaciones disponibles.
2. Comprobar que el análisis corresponde a la **imagen exacta** que se publicará
   y a la URL real (`NEXT_PUBLIC_API_URL` queda incrustada al compilar Next.js).
3. Registrar para cada excepción temporal: CVE, paquete, versión, motivo técnico,
   mitigación, responsable de aceptación, fecha de aprobación y fecha de revisión.
4. No suprimir CVE ni cambiar sus severidades para forzar una aprobación.
5. Bloquear el release si existe cualquier CRITICAL o HIGH corregible, o si
   faltan aprobaciones documentadas de riesgos HIGH sin corrección.
6. Registrar artefactos, SBOM, digests y procedencia de las imágenes finales.

Este documento **no concede excepciones ni aceptación implícita**. Un workflow
preflight exitoso indica únicamente que se cumplió su política preliminar.

## Validación del cambio

```bash
git apply --check 18a1-upload-artifact-node24.patch
git apply 18a1-upload-artifact-node24.patch
git diff --check
git diff -- .github/workflows/release-candidate.yml .github/workflows/security.yml
```

Tras el push, comprobar el workflow `Tunupa CI - DevSecOps Scanning` y lanzar
manualmente `Tunupa - Release Candidate Preflight (no publish)` para verificar
que el paso de subida de reportes funcione sin la advertencia Node.js 20.
No se necesitan secretos, VPS ni dominio para esta verificación.
