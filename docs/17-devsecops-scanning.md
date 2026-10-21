# 17 — DevSecOps: npm audit, Trivy, CodeQL y Dependency Review

## Qué instala

Workflow separado: `.github/workflows/security.yml`.
Se ejecuta al hacer `push` en `main`, ante pull requests, manualmente, y los lunes a las
07:20 UTC. No usa `.env`, secretos, servidor real, ni realiza despliegues.

| Job | Función | Bloqueo actual |
| --- | --- | --- |
| `dependency-audit` (API / Web / Simulador) | `npm audit --omit=dev`, JSON + Job Summary | **No** por hallazgos; **sí** si falla la consulta o el formato |
| `trivy-config` | Misconfiguraciones de Docker / Compose, HIGH y CRITICAL | **No** por hallazgos; **sí** por fallo del escáner |
| `trivy-image` (API / Web) | Construye ambas imágenes localmente y analiza paquetes OS/Node | **No** por hallazgos; **sí** por fallo del build/escáner |
| `codeql` | Análisis de código JavaScript/TypeScript con `security-extended` | **Sí** si falla la herramienta (hallazgos se triagean en Security) |
| `dependency-review` (solo PR) | Bloquea introducir dependencias con vulnerabilidades altas o críticas | **Sí** |

Los escaneos Trivy y npm audit son una **línea base informativa**, no una
certificación de seguridad. Un workflow verde NO significa ausencia de
vulnerabilidades. Se deben revisar los avisos antes de permitir la publicación de
imágenes en el futuro `18-docker-release`. No se recomienda añadir
`continue-on-error` al paso completo; el resumen rechaza reportes faltantes.

## Acciones y permisos

- `contents: read` global. `security-events: write` solo en los jobs de CodeQL y
  Trivy que suben SARIF. Los PR externos omiten esos uploads.
- Las acciones de análisis nuevas se referencian por **SHA de commit** asociado
  a un release/tag verificable; actualizar de manera controlada.
- El repositorio se revisó como público al preparar esta entrega. Si cambia a
  privado, revisar la habilitación/licenciamiento de GitHub Code Security y
  Dependency Review **antes** del cambio.
- Cada artefacto npm audit o Trivy se conserva 14 días, sin tokens ni secretos.
- `npm audit` revisa solo dependencias de producción: las de desarrollo se
  tratarán posteriormente con una política diferenciada.
- CodeQL analiza JavaScript/TypeScript; no analiza automáticamente SQL, YAML,
  credenciales expuestas, ni las configuraciones en ejecución del futuro VPS.

## Validación tras el push

1. Abrir GitHub Actions -> **Tunupa CI - DevSecOps Scanning**.
2. Ver los siete jobs en `main`: tres `npm audit`, dos Trivy de imagen, un
   Trivy IaC y un CodeQL. El job `dependency-review` se omite en push y se
   ejecuta cuando se abre un PR.
3. Abrir **Summary** y revisar recuentos por severidad; descargar artefactos
   JSON/SARIF cuando existan avisos.
4. Revisar **Security > Code scanning** para alertas CodeQL y Trivy.
5. No copiar secretos ni subir archivos `.env` a GitHub.

## Próxima política de aceptación

Antes de publicar una imagen o realizar un despliegue:

- Clasificar vulnerabilidades por explotabilidad, exposición, paquete, versión
  corregida y necesidad real de la dependencia.
- Priorizar CRITICAL y HIGH de dependencias de ejecución e imágenes.
- Resolver hallazgos o documentar una excepción temporal con justificación y
  fecha de revisión, aprobada fuera del workflow.
- Establecer un umbral bloqueante basado en la línea base auditada.
- Aplicar las mismas verificaciones sobre la imagen final que se publique,
  asociándola a un digest SHA256 e incluyendo procedencia y SBOM.
- Separar el despliegue del pipeline de análisis y exigir aprobación humana.

No se incluyen cambios en Docker Compose, PostgreSQL, Mosquitto, Caddy,
WebSocket, migraciones o el entorno de WSL.
