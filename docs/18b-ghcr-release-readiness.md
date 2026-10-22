# 18b — Preparación de publicación controlada en GHCR (sin push)

## Estado

Tunupa validó los controles del overlay `compose.hardening.yaml` y el overlay
`compose.readonly.yaml` en su entorno de pruebas. El preflight de las imágenes
registró ocho identificadores CVE HIGH (43 hallazgos por imagen) y ningún
CRITICAL/HIGH corregible en esa ejecución. La línea base puede cambiar.

**Todavía NO se han evaluado ni aceptado las ocho CVE. No publicar imágenes.**
Esta entrega no utiliza `packages: write`, no realiza login en GHCR, no crea
secretos y no despliega ningún contenedor.

## Archivos

- `security/release-risk-reviews.json`: formulario por CVE. Sus ocho registros
  comienzan en `PENDING`, sin firmas, sin aceptación y con
  `publication_authorized: false`.
- `scripts/ci/release_readiness.py`: muestra el estado y comprueba que exista
  una justificación, responsable, revisor, evidencia HTTPS y fecha de revisión
  futura por cada CVE que siga presente.
- `scripts/ci/test_release_readiness.py`: pruebas del validador.
- `.github/workflows/release-candidate.yml`: agrega un resumen **informativo**
  del avance en la revisión, sin otorgar permisos para publicar.

## Uso inmediato (informativo)

```bash
python3 -m unittest discover -s scripts/ci -p 'test_release_readiness.py' -v
python3 scripts/ci/release_readiness.py --mode report
```

El modo `report` no bloquea únicamente por revisiones pendientes; imprime
**NO AUTORIZADO PARA GHCR**. Sí falla si el inventario o el formulario son
inválidos. No se modifican aprobaciones por ejecutar el comando.

## Modo check: futuro prerrequisito de un publisher, NO una aprobación

Cuando haya URL pública HTTPS real y se hayan evaluado individualmente las CVE,
se pueden completar las revisiones con expediente técnico, propietario del riesgo,
revisor autorizado, fecha y próxima fecha de revisión. Se ejecutará:

```bash
python3 scripts/ci/release_readiness.py --mode check \
  --origin https://motores.dominio-real.cl \
  --api trivy-release-api.json \
  --web trivy-release-web.json
```

La URL mostrada es **un ejemplo de formato**, no un dominio elegido o validado.
El script rechaza localhost, HTTP, `example.invalid`, orígenes con rutas,
puertos distintos de 443, IP literales y formularios incompletos.

El modo `check` comprueba además la lista actual de hallazgos, bloquea nuevas
CVE HIGH, cualquier CRITICAL, una HIGH corregible, y excepciones faltantes o
caducadas. No permite que agregar una CVE a la lista sirva como excepción.

## Controles externos indispensables

1. Un responsable humano debe revisar la **aplicabilidad real** de cada CVE,
   mitigación y versión de imagen. Los campos del JSON **no prueban** la
   identidad del aprobador; deben enlazar un expediente verificable.
2. Crear y **configurar manualmente** el GitHub Environment `ghcr-publish` con
   *required reviewers* y, preferentemente, *prevent self-review*. No confiar
   en un environment sin reglas: GitHub puede crearlo sin protección.
3. El futuro job de publicación debe usar `environment: ghcr-publish`, acceso a
   paquetes únicamente en ese job, tags inmutables por SHA y la misma imagen
   escaneada (no una reconstrucción diferente). Requiere SBOM, procedencia y
   digest de cada imagen. Nunca publicar `:latest` de forma automática.
4. Next.js usa `NEXT_PUBLIC_API_URL` **en build time**. No publicar el bundle
   `https://example.invalid` como candidato de despliegue. La URL final exige
   un dominio HTTPS real.
5. El overlay de endurecimiento local **no viaja dentro de la imagen**: se
   debe aplicar de nuevo en el Compose del futuro VPS.

## Reversión

Este cambio solo agrega controles de validación y documentación. No toca
Dockerfiles, bases de datos, despliegues ni credenciales.
