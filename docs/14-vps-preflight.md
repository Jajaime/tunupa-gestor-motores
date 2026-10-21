# 14 — Preflight de VPS Linux (independiente del proveedor)

## Objetivo

Auditar **sin levantar ni recrear contenedores** que la variante HTTPS resultante
no publica accidentalmente la base de datos, MQTT sin TLS ni los servicios API/Web/Grafana.
Se requiere Python 3 y Docker Compose, pero **no contratar un VPS todavía**.
El script inspecciona Compose mediante `config --format json` y **nunca imprime**
la configuracion completa ni las contraseñas.

## Prueba local de plantilla

El `.env` operativo debe existir y conservar las contraseñas/secretos que ya usan
los servicios. El valor de ejemplo solamente verifica la estructura, no DNS real.

```bash
CADDY_DOMAIN=motores.example.com python3 scripts/deployment/preflight_vps.py --template
```

Esperado: `OK: rutas, puertos, cookie Secure, origen HTTPS y persistencia TLS
consistentes.` seguido de `MODO PLANTILLA`. No se modifica el Docker local.

Si falla, **no forzar la activacion** del overlay: revisar la descripcion del error,
`compose.https.yaml` y `.env` sin imprimir secretos.

## En VPS, cuando exista dominio real

1. Preparar Ubuntu Server LTS o Debian estable (arquitectura amd64 o arm64
   compatible con las imagenes elegidas). Crear cuenta administrativa no root
   con acceso SSH por llave y privilegios sudo. Antes de deshabilitar accesos,
   verificar un segundo acceso SSH efectivo.
2. Activar firewall del proveedor y firewall de la VM. Publicos solamente
   80/tcp y 443/tcp; 443/udp opcional HTTP/3. SSH 22/tcp restringido a las IP
   administrativas, o puerto personalizado. No exponer 5432/1883/3000/3002/3001.
3. Registrar A (y AAAA solo si IPv6 realmente funciona) a la IP publica.
4. Copiar codigo por Git y crear `.env` exclusivo del servidor, con permisos
   restrictivos, credenciales nuevas/rotadas, `CADDY_DOMAIN` real y backup.
   No subir `.env` al repositorio. Los secretos incluidos en variables de Compose
   pueden ser accesibles a operadores del daemon Docker: limitar su acceso.
5. Ejecutar sin `--template`:

```bash
python3 scripts/deployment/preflight_vps.py
```

6. Si el preflight da OK, verificar por separado DNS, copias de seguridad con
   restauracion, puertos libres, politica de actualizaciones, monitoreo y prueba
   de certificado TLS antes de abrir acceso de usuarios.
7. No levantar la variante HTTPS antes de cerrar la politica de acceso a
   **Grafana**: la version actual ofrece `/grafana/` por Internet, protegido
   unicamente por su propio login. Recomendada VPN privada o lista de IPs,
   ademas del login. El preflight no prueba ese control externo.
8. Si habra dispositivos ESP32/4G remotos, diseñar **MQTT sobre TLS/mTLS** y
   autorizacion por dispositivo. El overlay HTTPS no publica 1883 al exterior,
   por lo que sensores de Internet no podran conectarse directamente.

## Consideraciones arquitectonicas pendientes

- `timescale/timescaledb:latest-pg16` es una etiqueta movil: para un VPS,
  fijar una version/digest compatible y probar actualizaciones + rollback.
- Automatizar backups de TimescaleDB y Grafana fuera del VPS y verificar restore.
- No mezclar `compose.caddy.yaml` en una implementacion VPS: usar el trio
  `compose.yaml` + `compose.docker.yaml` + `compose.https.yaml`.
- HTTPS de Caddy protege navegador→proxy; no reemplaza MQTT seguro ni
  autenticacion de dispositivos, observabilidad, ni segregacion de redes.
- Nunca ejecutar `docker compose down -v` en el entorno con datos reales.

Este parche NO abre puertos, NO modifica un servicio y NO inicia HTTPS.
