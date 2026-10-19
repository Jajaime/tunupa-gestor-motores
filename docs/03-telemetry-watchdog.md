# Punto 3: detectar pérdida de telemetría

Aplicar después de los patches 01 y 02. Base del backend y simulador:
`2c783c46090df5e7933d1d225a85017ea52f17af`; frontend con patch 02 aplicado.

## Resultado

- Cada dispositivo registra la recepción de su última telemetría válida no duplicada.
- Un monitor revisa cada 5 segundos y marca INACTIVE los dispositivos ACTIVE
  que superaron 30 segundos sin recibir una nueva medición.
- El estado del motor se calcula con todos sus dispositivos. Una fuente activa
  con telemetría reciente conserva conectividad; las alarmas abiertas determinan
  RUNNING, WARNING o CRITICAL. Sin ninguna fuente reciente queda OFFLINE.
- Antes de la primera lectura, un ONLINE reciente deja el motor UNKNOWN. Al
  terminar la gracia inicial puede pasar a OFFLINE. Un dispositivo nunca conectado
  conserva UNKNOWN. Los dispositivos MAINTENANCE no son desactivados por el monitor.
- Un ONLINE posterior a mediciones vencidas no vuelve a declarar RUNNING: hace
  falta nueva telemetría. Las alarmas existentes se conservan durante el silencio.
- La ingesta válida recupera automáticamente ACTIVE y recalcula el motor.
- El indicador del dashboard refleja la última consulta del resumen de motores:
  conectando, API conectada o API no disponible. No demuestra conexión con Mosquitto.
- WARNING y CRITICAL cuentan como conectados; UNKNOWN no se mezcla con OFFLINE.
- Un motor OFFLINE muestra sus últimas lecturas con un aviso de falta de telemetría.

La hora de recepción del servidor se separa de `measured_at`, que proviene del
dispositivo. Los mensajes duplicados y rechazados no actualizan esa recepción.
La migración 005 recupera la recepción histórica desde `telemetry_ingestions`;
no cambia las migraciones 001–004 ni borra mediciones, usuarios o alarmas.
El monitor bloquea primero el motor, igual que la ingesta, y omite motores que
otra transacción mantiene ocupados. No ejecuta revisiones solapadas.

## Aplicar

Detener NestJS con Ctrl+C antes de aplicar, para que su recarga automática no
ejecute el código nuevo antes de migrar la base de datos.

Desde la raíz del repositorio, con el patch en esa carpeta:

```bash
git apply --check 03-deteccion-telemetria.patch
git apply 03-deteccion-telemetria.patch
git diff --check
make db-backup
make db-migrate
make db-migrate-status
```

Debe figurar aplicada `005 telemetry_watchdog`.

En el `.env` que lee NestJS (raíz, o `apps/api/.env` si ese archivo existe):

```dotenv
TELEMETRY_TIMEOUT_SECONDS=30
TELEMETRY_CHECK_INTERVAL_MS=5000
```

No poner estas variables en `apps/web/.env.local`. Los valores también tienen
estos defaults en el código. Con ellos, el cambio se verá aproximadamente entre
30 y 40 segundos después de la última medición: timeout + revisión + polling web.

## Verificar compilación y pruebas

API, desde `apps/api`:

```bash
npm run build
npm test -- --runInBand
npm run start:dev
```

Frontend, en otra terminal desde `apps/web`:

```bash
npm run lint
npm test
npm run build
npm run dev
```

Simulador, desde `apps/simulator`:

```bash
npm run build
npm run typecheck
```

No se agregan dependencias. El patch agrega cuatro pruebas del monitor de
backend y tres del resumen de frontend; conserva las pruebas previas.

## Probar silencio con MQTT conectado

Usar las credenciales y los códigos de dispositivo ya configurados en el `.env`
del simulador. Detener cualquier otra instancia que publique para esos mismos
dispositivos; otra fuente de mediciones impediría que expiren.

Desde `apps/simulator`:

```bash
npm run simulate -- --scenario telemetry-silence --silence-after 5
```

Publica cinco mensajes con los valores normales y deja de publicar mediciones.
El proceso y el cliente MQTT permanecen activos. Debe aparecer:

```text
sin nuevas mediciones; MQTT continúa conectado.
```

Mantenerlo abierto unos 40 segundos después del aviso. En el dashboard:

1. El motor pasa a Desconectado si ninguna otra fuente suya sigue enviando datos.
2. Baja En línea y sube Desconectados.
3. Aparece el aviso de últimas lecturas guardadas.
4. API conectada sigue visible mientras NestJS responda correctamente.

Detener el simulador con Ctrl+C y reiniciarlo:

```bash
npm run simulate -- --scenario normal
```

La siguiente telemetría válida recupera el motor. Su estado será RUNNING,
WARNING o CRITICAL según las alarmas abiertas; el escenario normal usa valores
genéricos que pueden variar respecto de la corriente nominal de cada motor.

Para revisar las fechas y estados, desde la raíz:

```bash
docker compose exec -T timescaledb sh -c '
  psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
' <<'SQL'
SELECT d.device_code, d.status AS device_status,
       d.last_telemetry_received_at,
       m.code AS motor_code, m.operational_status, m.last_telemetry_at
FROM public.devices AS d
JOIN public.motors AS m ON m.id = d.motor_id
ORDER BY d.device_code;
SQL
```

## Probar el indicador de API

Con la sesión abierta, detener NestJS y esperar a la siguiente consulta.
El indicador cambia a API no disponible; las lecturas conservadas no son nuevas.
Reiniciar NestJS permite recuperar el indicador tras una consulta correcta.
Si la sesión ya venció y no puede renovarse, la pantalla vuelve al login.

## Validación realizada al preparar el patch

Build de API, simulador y frontend; lint de los archivos nuevos/modificados de
API y del frontend; 28 pruebas unitarias de API y 12 de frontend; diez
comprobaciones de ingesta, SQL y migraciones con PostgreSQL embebido (PGlite),
sin extensión TimescaleDB; escenario de silencio probado con un broker MQTT de
prueba (Aedes); cambios de conectividad y conteos probados en navegador con API
simulada. Confirmar la prueba manual con Mosquitto y TimescaleDB locales.

## Reversión

Si 005 es la última migración aplicada, detener API y simulador, ejecutar
`make db-migrate-down`, y revertir el código del patch antes de iniciar la API.
La reversión elimina la columna nueva de recepción; conserva los datos de
telemetría y alarmas. No ejecutar un rollback de una migración anterior.

## Commit después de validar

```bash
git diff --check
git add .env.example apps/api/src/app.module.ts apps/api/src/main.ts \
  apps/api/src/telemetry apps/simulator/.env.example apps/simulator/src/index.ts \
  apps/web/package.json apps/web/src/app/globals.css \
  apps/web/src/components/dashboard/dashboard.tsx \
  apps/web/src/lib/dashboard-status.ts apps/web/tests/dashboard-status.test.mjs \
  database/migrations/005_telemetry_watchdog.up.sql \
  database/migrations/005_telemetry_watchdog.down.sql docs/03-telemetry-watchdog.md
git commit -m "feat(telemetry): detect silent devices and show API connection state"
```
