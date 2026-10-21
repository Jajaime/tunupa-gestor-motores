# 15 — CI: calidad y construcción Docker

## Objetivo

Comprobar cada PR y cada push a `main` antes de comenzar con la entrega de
DevSecOps (Trivy/CodeQL) y despliegue VPS. Este workflow **no publica imágenes,
no despliega servidores y no dispone de secretos de producción**.

Archivo: `.github/workflows/ci.yml`.

## Jobs

| Job | Pruebas | Requiere servicio externo |
| --- | --- | --- |
| `api` | ESLint sin `--fix`, build NestJS, unit tests Jest | No |
| `web` | ESLint, typecheck + pruebas frontend, build Next.js | No |
| `simulator` | TypeScript, build, pruebas de escenarios | No |
| `docker-build` | Compilar imágenes Docker API y Web, después de pasar api/web | No |

Node 24 se lee desde `.nvmrc`, y cada aplicación instala sus propias
versiones bloqueadas con `npm ci` y su `package-lock.json`. No se ejecuta
`npm install` en raíz: el `package.json` raíz tiene scripts Turbo, pero no
proporciona una instalación de Turbo independiente.

Las variables `NEXT_PUBLIC_*` se incrustan en el frontend durante el build.
El workflow usa `https://example.invalid/api/v1`, un marcador no operativo,
**solo** para probar la compilación. Estas imágenes no se deben publicar ni
desplegar; cuando haya dominio real, la imagen Web tendrá que recompilarse.

## Auditoría de dependencias

`npm audit --omit=dev --audit-level=high` se ejecuta por aplicación inicialmente
con `continue-on-error: true`: es un **informe de línea base, no una garantía
ni un control de bloqueo**. Los hallazgos se deben clasificar y corregir; luego
convertirlo en una comprobación obligatoria con umbral documentado.

La primera entrega **no incluye** todavía escaneo de imagen con Trivy,
CodeQL ni análisis de secretos. Estos se incorporarán en una etapa aparte,
tras confirmar que la CI básica funciona y revisar los permisos del repositorio.

**Advertencia para repositorios privados:** GitHub CodeQL code scanning puede
requerir activar GitHub Code Security o un plan habilitado. Verificar antes de
configurar el job para evitar errores por permisos. Trivy puede generar un
informe de texto/artifact aunque no esté disponible subir SARIF a Code Scanning.

## Pruebas de integración pendientes

Los scripts `test:telemetry`, `test:realtime` y `test:events` de NestJS usan
PostgreSQL real; **no se ejecutan** en este primer workflow. Se añadirá un job
con TimescaleDB efímero, migraciones y datos sintéticos, usando credenciales
únicas de CI, sin acceder a la base real de Tunupa.

## Verificación y aceptación

1. Después de aplicar el parche, revisar `git diff --check` y los archivos nuevos.
2. Confirmar en GitHub Actions que `api`, `web`, `simulator` y `docker-build`
   terminan correctamente. `docker-build` depende de `api` y `web`.
3. Si hay un fallo, abrir el job y compartir las líneas del error, sin secretos.
4. Si solo fallan auditorías informativas, registrar esos hallazgos y continuar
   con su clasificación: **no** significa que las vulnerabilidades no existan.
5. No activar despliegue ni credenciales VPS en esta entrega.

## Seguridad del workflow

- `GITHUB_TOKEN` con solo `contents: read`.
- Checkout sin persistir credenciales.
- Sin `pull_request_target`, sin acciones de escritura, sin secrets ni SSH.
- Versiones de acciones fijadas a versiones de lanzamiento. Para un entorno
  de mayor exigencia, fijar también las acciones a SHA de commit verificados
  y gestionar las actualizaciones mediante Dependabot.
