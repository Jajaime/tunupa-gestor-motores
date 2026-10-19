# Parche 08: dashboard técnico Grafana

Requiere el parche 07 aplicado y datasource `tunupa_timescaledb` funcionando.
No contiene migraciones ni cambios a NestJS, Next.js o Mosquitto.

## Aplicar

```bash
git apply --check 08-grafana-dashboard.patch
git apply 08-grafana-dashboard.patch
git diff --check
docker compose config --quiet
docker compose up -d --no-deps --force-recreate grafana
```

Abrir http://localhost:3001, Dashboards → Tunupa → Tunupa | Monitoreo técnico de motores.
El provisioning incorpora un montaje de solo lectura para `infrastructure/grafana/dashboards`, con el dashboard versionado en JSON. Los cambios hechos en la interfaz no se guardan en el archivo; edita JSON en Git.

## Contenido

- 5 indicadores: motores registrados, estado RUNNING (BD), estado OFFLINE (BD), alarmas abiertas y motores con telemetría recibida en los últimos 60 segundos.
- 6 gráficas: TEMPERATURE (C), CURRENT (A), VOLTAGE (V), FREQUENCY (Hz), ROTATION_SPEED (rpm) y VIBRATION (mm/s).
- Alarmas por fecha de inicio; últimas mediciones dentro del rango temporal.
- Selectores de motor y dispositivo, incluida la opción All.
- Refresco cada 10 segundos; rango inicial de 6 horas (ajustarlo para ver datos anteriores).
- Las gráficas solo consideran calidad `GOOD` y normalizan tipo con UPPER() para admitir muestras antiguas minúsculas. No se combinan tipos ni unidades distintos.
- Los indicadores RUNNING/OFFLINE leen `motors.operational_status`: son el último estado persistido, no una comprobación de transmisión instantánea.
- El indicador de telemetría reciente cuenta motores distintos con `received_at` dentro de los últimos 60 segundos, filtrados por motor/dispositivo; es independiente del rango temporal de la vista y de los estados del watchdog. Refleja ingesta reciente (no garantiza conectividad continua).
- La velocidad de rotación usa la unidad personalizada `suffix:rpm` para evitar que Grafana la presente como `rd/m`.
- Tabla de alarmas filtra por `started_at`; las alarmas antiguas no aparecen en rangos recientes.
- `measurement_devices` es inventario auxiliar y no se une con `devices` sin una relación formal.

## Validación

1. La conexión `Tunupa TimescaleDB` debe seguir siendo exitosa.
2. En rango Last 6 hours, con simulador normal en ejecución, verificar series de seis variables. Si no aparecen muestras, elegir un rango absoluto que incluya las fechas en `public.telemetry`.
3. Cambiar Motor y Dispositivo y comprobar que las series y tablas se filtren correctamente.
4. Seleccionar un rango histórico de septiembre/octubre 2026 para revisar mediciones y alarmas resueltas.
5. Con el simulador activo, el indicador de telemetría reciente debe contabilizar el motor que envía datos. Detener la emisión, esperar más de 60 segundos y comprobar que baja a cero para ese motor. El estado OFFLINE puede aparecer en otro momento, cuando el watchdog actualice `motors.operational_status`.
6. Reiniciar Grafana y comprobar que el dashboard permanece provisionado.
7. Comprobar NestJS, Next.js y Mosquitto.

## Seguridad / notas

Conservar `grafana_reader` con SELECT solamente; no introducir contraseñas en JSON. Grafana expone el puerto solo en 127.0.0.1.
La cuenta Grafana administradora puede consultar todos los motores visibles para `grafana_reader`; este dashboard no implementa segregación multicliente.
Los filtros Grafana son para navegación, no son un control de autorización. Para producción, diseñar permisos por cliente en la base y acceso controlado a Grafana.

## Reversión

Antes de otros cambios sobre esos archivos:

```bash
git apply --reverse --check 08-grafana-dashboard.patch
git apply --reverse 08-grafana-dashboard.patch
docker compose up -d --no-deps --force-recreate grafana
```
