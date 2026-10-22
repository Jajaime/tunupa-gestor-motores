# 18a2 — Endurecimiento optativo del runtime (API y Web)

## Motivación

El preflight manual 18a1 registró 0 hallazgos bloqueantes bajo su política
preliminar, pero 43 HIGH sin FixedVersion por imagen (8 CVE identificadas,
replicadas entre API y Web). No existe todavía aprobación del riesgo residual.

Este overlay limita algunas posibilidades de escalamiento desde un proceso que
ya estuviera comprometido. **No resuelve, suprime, acepta ni corrige CVE**, y no
autoriza GHCR ni el despliegue al VPS. Su utilidad exacta debe validarse en el
entorno real. Los Dockerfiles ya utilizan `USER node`.

### Qué hace

- `cap_drop: [ALL]`: quita todas las capacidades Linux agregadas al proceso,
  incluyendo capacidades de montajes y administración del sistema. No modifica
  los privilegios del host ni aplica un sandbox perfecto.
- `security_opt: [no-new-privileges:true]`: impide adquirir privilegios
  adicionales vía mecanismos como ejecutables setuid.
- `pids_limit: 256`: limita el número de procesos/hilos del contenedor. Ajustar
  si las mediciones reales muestran que se necesita mayor capacidad.

Se aplica exclusivamente a API y Web. **No** se impone `read_only` aquí:
Next.js y otras bibliotecas podrían necesitar escribir temporalmente; esa medida
se evaluará después de identificar rutas y permisos de escritura.

## Validar sin interrumpir el entorno

Desde la raíz del repositorio:

```bash
docker compose -f compose.yaml -f compose.docker.yaml \
  -f compose.hardening.yaml config --quiet

# Validar sin mostrar valores sensibles ni volcar el Compose completo.
docker compose -f compose.yaml -f compose.docker.yaml \
  -f compose.hardening.yaml config --format json | \
  python3 -c 'import json,sys; s=json.load(sys.stdin)["services"]; assert all(s[n].get("cap_drop")==["ALL"] and "no-new-privileges:true" in s[n].get("security_opt",[]) and s[n].get("pids_limit")==256 for n in ("api","web")); print("OK: api y web endurecidos")'
```

## Prueba funcional CONTROLADA (causa reinicio breve de API y Web)

1. Terminar primero las pruebas `config --quiet`, no tocar el VPS.
2. Mantener respaldos y confirmar que es un entorno de pruebas.
3. Si hay simulador MQTT, detenerlo temporalmente: la ingesta puede perder
   mensajes no retenidos durante el reinicio.
4. Aplicar únicamente el overlay adicional:

```bash
docker compose -f compose.yaml -f compose.docker.yaml \
  -f compose.hardening.yaml up -d --no-deps --force-recreate api web

docker compose -f compose.yaml -f compose.docker.yaml \
  -f compose.hardening.yaml ps api web
```

5. Verificar `/api/v1/health`, login, CSRF, WebSocket `session.ready`, gráficos,
   eventos MQTT, reconexión, logout y que una consulta anónima protegida
   devuelve 401. Verificar que Caddy permanece en funcionamiento.

```bash
curl -fsS http://localhost:8080/api/v1/health
curl -sS -o /dev/null -w '%{http_code}\n' \
  http://localhost:8080/api/v1/dashboard/motors
```

La segunda salida esperada es `401`. Los errores 502 breves durante recreación
son esperados; deben cesar al quedar sanos ambos contenedores.

Para comprobar las opciones efectivas del contenedor, sin imprimir secretos:

```bash
for service in api web; do
  cid=$(docker compose -f compose.yaml -f compose.docker.yaml \
    -f compose.hardening.yaml ps -q "$service")
  test -n "$cid" || exit 1
  docker inspect --format 'CapDrop={{json .HostConfig.CapDrop}} SecurityOpt={{json .HostConfig.SecurityOpt}} PidsLimit={{.HostConfig.PidsLimit}}' "$cid"
done
```

### Reversión al comportamiento anterior

La reversión también recrea API y Web y genera una interrupción breve:

```bash
docker compose -f compose.yaml -f compose.docker.yaml \
  up -d --no-deps --force-recreate api web
```

Esta operación no borra imágenes o volúmenes. No ejecutar `down -v`.

## Próxima puerta antes de publicación en GHCR

- Analizar cada CVE y documentar paquete, versión, función vulnerable, si se usa
  en el proceso, explotabilidad, mitigaciones verificadas y propietario del riesgo.
- Obtener aceptación explícita con fecha de revisión para los HIGH residuales
  antes de autorizar una publicación destinada al despliegue.
- Build Web debe incorporar **un dominio HTTPS real** en `NEXT_PUBLIC_API_URL`;
  un artefacto construido con `https://example.invalid` no es desplegable.
- Análisis Trivy y firma/atestación, SBOM y digest deben corresponder a los
  mismos bytes de las imágenes finalmente publicadas. No suprimir CVE solo por
  tener el overlay aplicado.
