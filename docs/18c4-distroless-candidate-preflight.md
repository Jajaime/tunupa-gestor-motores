# Tunupa — 18c4: preflight Distroless separado (sin publicar)

**Estado: experimental / no autorizado para GHCR.** No cambia `apps/api/Dockerfile`, `apps/web/Dockerfile`, `compose.docker.yaml` ni el preflight Debian existente. No cambia `security/release-risk-reviews.json`.

## Por qué esta etapa

- 18c2: Trivy observó 43 HIGH por imagen Debian, 0 HIGH/CRITICAL por imagen Distroless. El resultado no demuestra por sí solo ausencia de riesgos o paquetes afectados.
- 18c3: ambas imágenes Distroless construyeron y los contenedores locales arrancaron **healthy** con UID 1000, raíz solo lectura, capacidades retiradas y límite RAM 768 MiB. El verificador reportó 0 OOMKilled y las 10 pruebas Python pasaron.
- 18c3 aún requiere una **confirmación documentada de las seis funciones de punta a punta** (login, dashboard, telemetría, histórico, reconexión WebSocket, logout). Un healthcheck no las sustituye.
- El preflight Debian anterior invoca `inspect_runtime_exposure.py`, que exige `/bin/sh` y `dpkg-query`. Distroless no provee shell. No debemos deshabilitar la inspección para conseguir verde.

## Workflow nuevo

`Tunupa - Distroless Candidate Preflight (no publish)` se ejecuta manualmente sobre `main`.

1. Audita dependencias npm productivas de API, Web y Simulador (bloquea vulnerabilidades).
2. Construye API y Web con `Dockerfile.distroless-eval` **solo en el runner de CI**, usando los tags temporales `tunupa-api:release-candidate` y `tunupa-web:release-candidate` para reutilizar el validador `candidate_evidence.py`.
3. Verifica `argon2` y la respuesta HTTP de Next.js en entornos aislados y restringidos; esto no es una prueba de integración completa.
4. Inspecciona ambas imágenes con `scripts/security/inspect_distroless_candidate.py`, iniciando un Node efímero (sin shell, red, montajes de host ni privilegios). Rechaza UID incorrecto, capacidades efectivas, falta de `no-new-privileges` o seccomp, y registra **solo** presencia de utilidades en rutas conocidas. Ausencia en esas rutas NO significa inexistencia total de un paquete.
5. Genera Trivy JSON y SBOM CycloneDX para ambas imágenes, y valida identidad de imagen con `candidate_evidence.py`. Bloquea CRITICAL, HIGH con FixedVersion y CVE fuera del inventario.
6. Conserva los seis archivos de evidencia durante 14 días.

**No usa `packages: write`, GHCR, GitHub Environment, secrets de publicación ni VPS.** El frontend se compila **deliberadamente** con `https://example.invalid/api/v1`, por lo que este candidato **no es desplegable**. Los IDs de imagen del runner no son digests del registro GHCR.

## Aplicación

```bash
cd ~/proyectos/Tunupa-gestor-motores
python3 -m unittest discover -s scripts/security -p 'test_inspect_distroless_candidate.py' -v
python3 -m unittest discover -s scripts/ci -p 'test_candidate_evidence.py' -v
```

Luego de aplicar el parche, hacer commit/push y entrar a GitHub Actions para lanzar el nuevo workflow. El resumen debe indicar que la prueba de Node y los escaneos concluyen, que los IDs de Trivy concuerdan con la evidencia y que el artefacto incluye seis archivos. Si falla, **no** relajar el control: recopilar el nombre del paso y errores antes de corregir.

## Antes de convertir Distroless en el runtime oficial

- Confirmar y guardar resultados de las seis operaciones de punta a punta en el beta local, incluyendo reconexión tras caída del canal.
- Evaluar contenido del SBOM Distroless y explicar por qué desaparecen los ocho identificadores históricos (retirada real de paquetes vs diferencias de detección); no borrar los expedientes de CVE todavía.
- Definir origen HTTPS real, revisar configuración Caddy/VPS y ensayar TLS, DNS, cookies y backups.
- Para publicar: construir **el candidato final con URL real**, escanearlo y conservar **exactamente sus bytes** hasta el push, sin reconstruir después de la aprobación.
- Exigir revisor humano distinto de quien solicita el release. Dos cuentas de una sola persona no son una aprobación independiente.

Este workflow da evidencia técnica, **no** resuelve automáticamente los expedientes históricos ni habilita GHCR.
