# Parche 06: eventos y actualización del dashboard

Base: parches 01–05 aplicados, incluida la conexión autenticada del parche 05.
Segunda entrega del punto 9. No agrega dependencias, variables ni migraciones.

## Aplicación manual

Detener API, frontend y simuladores. Mantener TimescaleDB y Mosquitto levantados.
Descargar el parche en la raíz del repositorio y ejecutar:

```bash
git apply --check 06-websocket-eventos.patch
git apply 06-websocket-eventos.patch
git diff --check
```

Si el primer comando falla, detenerse y revisar el mensaje. No usar `--reject`.
No hace falta repetir `npm ci` si las dependencias del parche 05 ya están instaladas.
Se conserva la configuración de cookies, API y WebSocket del parche anterior.

## Comportamiento

- NestJS registra los eventos dentro de la transacción de ingesta y los publica
  después del COMMIT exterior. Confirmar un savepoint no publica; revertirlo
  descarta sus eventos. Los mensajes MQTT duplicados no generan eventos nuevos.
- El monitor de silencio y los mensajes MQTT de estado también notifican los
  cambios efectivos del estado del motor. Un estado repetido no genera otro aviso.
- El gateway comprueba sesión y usuario activo antes de entregar cada lote a
  cada conexión. Se conserva el ciclo de expiración, renovación y logout del 05.
- El navegador recibe los eventos y vuelve a consultar el resumen y el histórico
  seleccionado. Agrupa ráfagas durante 200 ms y limita los inicios de recarga a
  uno por segundo. No hay consultas simultáneas del mismo ciclo; si llega otro
  evento durante HTTP, queda una recarga pendiente.
- Se elimina el sondeo de datos cada 5 segundos. Hay una consulta al entrar,
  al reconectar, al cambiar la selección, al volver a una pestaña visible y
  una reconciliación cada 60 segundos mientras la pestaña está visible.
- El botón Actualizar recarga resumen e histórico. Una respuesta del histórico
  de la selección anterior no reemplaza la selección actual.
- API, WebSocket y motor conservan estados separados. Un motor desconectado
  no significa que la API o el WebSocket estén caídos. Se conservan las últimas
  lecturas, identificadas como tales cuando se interrumpe la actualización.

## Contrato de eventos v1

Namespace `/dashboard`, path `/socket.io/`, mismo puerto de NestJS.
Todos los eventos de datos tienen este sobre:

```typescript
{
  version: 1,
  eventId: string,       // UUID del aviso; deduplicación del cliente
  occurredAt: string,    // fecha ISO UTC asignada al confirmar la transacción
  type: string,         // mismo nombre que el evento Socket.IO
  motorId: string,
  deviceId: string | null,
  data: { /* según el evento */ }
}
```

| Evento | Contenido de `data` |
| --- | --- |
| `telemetry.received` | `messageId`, `measuredAt`, `measurements[]` con `type`, `value`, `unit`, `quality` |
| `motor.status.changed` | `previousStatus`, `status`, `reason` |
| `alarm.changed` | `id`, `alarmType`, `severity`, `status`, `change`, `measuredValue`, `thresholdValue`, `unit`, `startedAt`, `resolvedAt` |

`change` es CREATED, UPDATED o RESOLVED. Una nueva medición de una falla activa
actualiza su alarma existente. `measuredValue` al resolver conserva el valor
registrado en la alarma; la medición de recuperación está en telemetry.received.
`reason` distingue TELEMETRY_RECEIVED, MQTT_ONLINE, MQTT_OFFLINE y TELEMETRY_TIMEOUT.
El monitor evalúa el motor y puede usar `deviceId: null`.

Los eventos son avisos para recargar datos autorizados por HTTP. No hay comandos
de escritura ni suscripción a salas elegidas por el navegador. La fuente de
verdad sigue siendo PostgreSQL. No se promete entrega durable ni reproducción
de todos los eventos: desconexión o caída entre COMMIT y envío se recuperan con
snapshot/reconciliación. No se depende del orden global entre transacciones.

La cola del gateway admite 100 lotes pendientes. Si se llena, desconecta con
session.unavailable para que el cliente reconecte y resincronice. El navegador
mantiene los últimos 512 eventId para ignorar repeticiones.

## Pruebas automáticas

Desde la raíz, con API/frontend/simuladores detenidos:

```bash
npm --prefix apps/api test -- --runInBand
npm --prefix apps/api run test:telemetry
npm --prefix apps/api run test:realtime
npm --prefix apps/api run test:events

npm --prefix apps/web run lint
npm --prefix apps/web test
npm --prefix apps/web run build
git diff --check
```

Esperado: 41 pruebas unitarias API, tres integraciones (una por comando),
28 pruebas web (10 auth, 3 dashboard, 8 sesión, 7 actualizaciones), lint y build.
Los comandos de integración incluyen las compilaciones necesarias.

`test:events` usa NestJS, HTTP, Socket.IO y SQL reales contra la base configurada
en `apps/api/.env` o `.env` de la raíz. Requiere las migraciones existentes hasta
005. Levanta un servidor temporal en un puerto libre; no requiere la contraseña
del administrador ni un simulador en ejecución.

Crea usuario, cliente, planta, motor y dispositivo con IDs aleatorios. A diferencia
del test de sesión, necesita confirmar transacciones para comprobar la emisión:
borra solamente sus filas al terminar, también ante un fallo normal de la prueba.
El adaptador del monitor limita su selección al motor sintético. No modifica el
dispositivo demo ni revoca sesiones del usuario. Una terminación forzada del proceso
puede impedir la limpieza de sus registros `EVENTS-*` / `verify-*@example.invalid`.

Comprueba persistencia antes del aviso, duplicados, rollback exterior después de
un savepoint, temperatura/corriente/vibración con creación, actualización y resolución
de alarmas, OFFLINE MQTT, silencio, recuperación, snapshot tras reconectar,
histórico autenticado y ausencia de datos después del logout.
La entrada MQTT se ejercita desde el validador y la ingesta; el recorrido con el
broker se verifica manualmente a continuación.

## Aceptación en el dispositivo demo

Levantar API y frontend en terminales separadas:

```bash
npm --prefix apps/api run start:dev
```

```bash
npm --prefix apps/web run dev
```

Abrir http://localhost:3000 e iniciar sesión. En otra terminal:

```bash
npm --prefix apps/simulator run simulate -- --devices ESP32-DEMO-001 --scenario normal --rated-current 2.5
```

Usar 2.5 A solo si sigue siendo la corriente nominal del motor demo. Ejecutar
un solo simulador para ese dispositivo. Detenerlo con Ctrl+C antes de cada cambio.

1. **Normal:** indicadores e histórico cambian sin recargar. API y tiempo real
   muestran conectado; el motor queda en línea si no tiene otras alarmas activas.
2. **Alarmas:** repetir el comando cambiando `normal` por `overtemperature`,
   `overcurrent` y `high-vibration`, uno por vez. El motor queda crítico y sube
   el contador. Volver a normal entre escenarios: se resuelve la alarma y se
   recupera el estado. En Network → WS aparecen los tres nombres de evento.
3. **Silencio:** ejecutar el comando normal sustituyendo sus argumentos de escenario
   por `--scenario telemetry-silence --silence-after 5`. Tras el timeout configurado
   (30 s por defecto) más el intervalo del monitor, el motor queda desconectado;
   API y tiempo real siguen conectados. Reiniciar normal y comprobar recuperación.
4. **Corte de la API:** mantener el simulador normal, detener NestJS y comprobar
   reconexión/últimas lecturas. Reiniciarlo: el canal y los datos se recuperan sin
   recargar la página. No se espera recuperar mensajes que MQTT no haya conservado.
5. **Selección y sesión:** cambiar variable mientras llegan datos, ocultar/volver
   a la pestaña, recargar e iniciar/cerrar sesión. No deben reaparecer históricos
   de una selección anterior ni reconectarse un dashboard después del logout.

En Network → Fetch/XHR, con motor sin nuevos eventos, no debe haber consultas de
dashboard cada 5 segundos. Sí puede haberlas por conexión, selección, visibilidad,
botón manual, eventos o reconciliación de 60 s. La revalidación de sesión de 5 s
del servidor sigue existiendo y no es sondeo del dashboard.

## Alcance y verificación durante la preparación

Diseñado para una instancia NestJS, con el mismo alcance de acceso que la API
actual. No incorpora aislamiento multicliente, adaptador distribuido ni outbox.
Cambios directos por SQL no emiten; aparecen en la siguiente consulta/reconciliación.
No incluye Grafana: corresponde al punto 10 después de aprobar esta aceptación.

Se verificaron build, lint de los archivos API modificados, lint web y pruebas
unitarias. Las integraciones se ejecutaron con HTTP/Socket.IO reales y el
PostgresQueryRunner de TypeORM sobre PGlite (PostgreSQL embebido), sin la extensión
TimescaleDB. La comprobación de tu contenedor se hace con los comandos anteriores.
También se probó Next.js de producción en Chromium con datos y API de prueba,
incluidos cambios por eventos, selección durante HTTP y recuperación de conexión.

## Reversión

Detener API y frontend. Si no hay cambios posteriores en los archivos del parche:

```bash
git apply --reverse --check 06-websocket-eventos.patch
git apply --reverse 06-websocket-eventos.patch
```

Reiniciar las aplicaciones. No hay migraciones ni dependencias que revertir.
