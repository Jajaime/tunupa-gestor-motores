# Punto 4: validar el recorrido completo

Base: patches 01, 02 y 03 aplicados y validados. Usar el dispositivo de
demostración `ESP32-DEMO-001`, con API y frontend funcionando y sin otra
instancia del simulador publicando para ese mismo código.

## Qué agrega este patch

1. Corriente nominal configurable en el simulador. Los escenarios normal y
   sobrecorriente se calculan respecto de ella, igual que los umbrales del backend.
2. Escenarios críticos repetibles: temperatura mayor a 95 C, corriente mayor a
   dos veces la nominal y vibración mayor a 7.1 mm/s. El resto de las variables
   permanece dentro de los rangos normales de demostración.
3. Un informe SQL de solo lectura con estado, fechas, mediciones, alarmas y conteos.
4. Una prueba HTTP interactiva de sesión, resumen, seis variables e histórico,
   que también comprueba rechazo de filtros inválidos y protección tras logout.
5. Siete pruebas automáticas del generador de mediciones.
6. Corrección del conflicto de tipos al actualizar una alarma repetida y de la
   lectura de resultados UPDATE/RETURNING con TypeORM/PostgreSQL. Esto permite
   devolver correctamente el estado operativo y contar los dispositivos expirados.
7. Una prueba de integración con el driver real de PostgreSQL: crea datos de
   verificación dentro de una transacción y los revierte al finalizar, incluso
   si falla una comprobación. No usa el dispositivo de demostración para esa prueba.

Estos rangos reproducen las reglas actuales del beta; no son una calibración
ni una recomendación de límites para equipos reales.

## 1. Aplicar y comprobar

Detener temporalmente los procesos de desarrollo de API/frontend para compilar
y probar. Desde la raíz:

```bash
git apply --check 04-validacion-recorrido.patch
git apply 04-validacion-recorrido.patch
git diff --check
```

Desde `apps/simulator`:

```bash
npm run build
npm run typecheck
npm test
```

Al cerrar el punto 4, ejecutar también las regresiones de API y frontend:

```bash
# Desde apps/api
npm run build
npm test -- --runInBand
npm run test:telemetry
```

```bash
# Desde apps/web
npm run lint
npm test
npm run build
```

Mantener API y frontend activos en sus propias terminales para las pruebas siguientes.
`test:telemetry` lee las mismas variables POSTGRES del `.env` local de la API
y de la raíz. Requiere las migraciones hasta 005 y los servicios de base de datos
ya levantados. Sus datos sintéticos se revierten; las pruebas manuales del
simulador sí generan mediciones y alarmas de demostración persistentes.

## 2. Consultar y configurar la corriente nominal

Desde la raíz:

```bash
bash scripts/verification/inspect-flow.sh ESP32-DEMO-001
```

En el primer bloque, leer `corriente_nominal_para_simulador`. Copiar ese número
en `apps/simulator/.env`, usando punto decimal:

```dotenv
# Ejemplo: usar 3 solo si el informe muestra 3 para ese motor.
SIMULATOR_RATED_CURRENT_A=3
```

Si `rated_current` es NULL, el informe usa la misma referencia de 3 A que el
backend. Se puede sobrescribir mediante `--rated-current`, por ejemplo
`--rated-current 10`, únicamente si la referencia de ese motor es 10 A.
Cada proceso muestra la corriente utilizada al iniciar.

Para validar otro motor, configurar una referencia apropiada para él y ejecutar
un proceso separado. Un proceso con varios dispositivos comparte la referencia.

## 3. Recorrido normal

Desde `apps/simulator`:

```bash
npm run simulate -- --devices ESP32-DEMO-001 --scenario normal
```

Esperar al menos tres publicaciones. En el navegador debe verse el motor en
línea, con las seis variables y un histórico que recibe nuevas muestras.
Desde otra terminal, en la raíz:

```bash
python3 scripts/verification/check-dashboard.py --device ESP32-DEMO-001
```

Ingresar el administrador existente y su contraseña. Se esperan seis OK y:

```text
RESULTADO: sesión, resumen e histórico verificados por HTTP.
```

La prueba requiere Python 3 y el script del patch 01. Usa una sesión propia con
cookies en memoria y cierra solo esa sesión; el navegador sigue conectado.
No imprime ni guarda contraseñas, tokens o hashes.

Ejecutar dos veces el informe de solo lectura, separadas por algunas publicaciones:

```bash
bash scripts/verification/inspect-flow.sh ESP32-DEMO-001
```

Las fechas de recepción y los conteos deben avanzar. En las seis últimas
mediciones debe aparecer `scenario = normal`. Comparar el último dato de
temperatura y su fecha con el dashboard; mientras el simulador publica pueden
corresponder a instantes ligeramente diferentes.

Si el informe devuelve cero filas, comprobar código y asociación al motor;
esa salida no valida el recorrido.

## 4. Matriz de fallas y recuperación

Ejecutar un escenario a la vez, con Ctrl+C antes de cambiarlo. Los siguientes
comandos se ejecutan desde `apps/simulator`; revisar el dashboard y ejecutar el
informe SQL desde otra terminal después de recibir algunas publicaciones.

| Escenario | Comando | Resultado esperado |
| --- | --- | --- |
| Sobretemperatura | `npm run simulate -- --devices ESP32-DEMO-001 --scenario overtemperature` | Motor CRITICAL y alarma HIGH_TEMPERATURE activa |
| Recuperación | `npm run simulate -- --devices ESP32-DEMO-001 --scenario normal` | Motor RUNNING; la alarma anterior queda RESOLVED |
| Sobrecorriente | `npm run simulate -- --devices ESP32-DEMO-001 --scenario overcurrent` | Motor CRITICAL y alarma OVERCURRENT activa |
| Recuperación | `npm run simulate -- --devices ESP32-DEMO-001 --scenario normal` | Motor RUNNING; alarma anterior RESOLVED |
| Vibración elevada | `npm run simulate -- --devices ESP32-DEMO-001 --scenario high-vibration` | Motor CRITICAL y alarma HIGH_VIBRATION activa |
| Recuperación | `npm run simulate -- --devices ESP32-DEMO-001 --scenario normal` | Motor RUNNING; alarma anterior RESOLVED |
| Pérdida abrupta | `npm run simulate -- --devices ESP32-DEMO-001 --scenario connection-loss` | Tras cinco mensajes el proceso termina con SIGKILL; Last Will o watchdog deja el motor OFFLINE |
| Recuperación | `npm run simulate -- --devices ESP32-DEMO-001 --scenario normal` | Motor RUNNING después de nueva telemetría válida |
| Silencio con MQTT conectado | `npm run simulate -- --devices ESP32-DEMO-001 --scenario telemetry-silence --silence-after 5` | OFFLINE tras el timeout, ya validado en el punto 3 |

Con una alarma crítica, el motor sigue incluido en En línea y aumenta Alarmas
activas. Mientras la API responda, el indicador API conectada permanece visible.
Repetir publicaciones de la misma falla no debe crear múltiples alarmas abiertas
del mismo tipo para ese dispositivo. El informe muestra las últimas diez alarmas,
incluyendo las resueltas, para comprobar estos cambios.

Si otras fuentes del mismo motor tienen alarmas abiertas, puede seguir CRITICAL
aunque se resuelva la del dispositivo probado; revisar el alcance antes de
interpretarlo como un fallo de recuperación.

## 5. Sesión, conexión y evidencia de cierre

- Con el dashboard abierto, eliminar solo `tunupa_access` en las cookies del
  navegador: la siguiente consulta debe renovar y continuar. Esto comprueba
  recuperación ante ausencia del token, no su expiración por tiempo.
- Mantener la sesión durante su TTL real (`AUTH_ACCESS_TTL_SECONDS`, por defecto
  900 segundos). En Network debe verse refresh 200 al vencer el acceso y el
  dashboard debe continuar. Se puede dejar abierto durante las demás pruebas.
- Si también se elimina `tunupa_refresh`, volver al login en la siguiente consulta.
- Con sesión activa, detener la API: API no disponible y lecturas guardadas.
  Reiniciar permite recuperar las consultas; si la sesión ya no es válida,
  corresponde regresar al login.
- Login, recarga y logout del punto 2 deben seguir funcionando.

Compartir: resultados de build/tests, los seis OK del verificador HTTP, resultado
de cada fila de la matriz y las alarmas/estados observados. No compartir `.env`
ni cookies. Cerrar este punto cuando todos los resultados esperados estén
confirmados; el siguiente paso será acordar el contrato de eventos WebSocket.

## Validación al preparar el patch

Build, typecheck y siete pruebas del simulador; Bash/Python revisados; escenarios
con un broker MQTT de prueba, validación e ingesta reales del backend y PostgreSQL
embebido sin TimescaleDB; resumen e histórico del backend consultados mediante
una fachada HTTP con autenticación simulada; regresiones de backend y prueba del
QueryRunner real de TypeORM sobre el motor embebido, con rollback comprobado.
La aceptación local usa el NestJS,
Mosquitto y TimescaleDB del proyecto con sus credenciales reales.

## Commit después de validar

```bash
git diff --check
git add apps/simulator/.env.example apps/simulator/package.json \
  apps/simulator/src/index.ts apps/simulator/src/scenarios.ts \
  apps/simulator/tests/scenarios.test.mjs apps/api/package.json \
  apps/api/src/telemetry/telemetry-ingestion.service.ts \
  apps/api/src/telemetry/motor-state.service.ts \
  apps/api/src/telemetry/telemetry-watchdog.service.ts \
  apps/api/test/telemetry.integration.mjs scripts/verification \
  docs/04-validacion-recorrido-completo.md
git commit -m "test(stack): add repeatable telemetry and alarm verification"
```
