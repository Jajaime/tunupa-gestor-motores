# Parche 05: conexión WebSocket autenticada y ciclo de sesión

Base: parches 01–04 aplicados. Primera parte del punto 9 de la ruta, después
de acordar el contrato en el punto 5 de preparación.

## Alcance

- Socket.IO 4.8.3, namespace `/dashboard`, transporte WebSocket y ruta
  `/socket.io/`, en el mismo puerto de NestJS (3001 por defecto).
- Indicador independiente junto a los controles de sesión: conectando,
  conectado, reconectando o desconectado.
- Cookie `tunupa_access` HttpOnly para autenticar; se valida firma, expiración,
  sesión existente/no revocada y usuario activo. No se aceptan tokens por URL.
- El servidor exige exactamente el `WEB_ORIGIN` configurado, incluso en el
  handshake WebSocket; rechaza origen ajeno o ausente.
- Renovación HTTP con CSRF y cookies existentes. Se conserva el identificador
  de sesión (`sid`) al rotar el refresh token. El token anterior deja de servir.
- HTTP también comprueba la sesión: un access token copiado antes del logout
  deja de dar acceso tras su revocación.
- Logout revoca por el sid autenticado y cierra todos sus sockets. Otro login
  del mismo usuario representa otra sesión y se conserva.
- Vencimiento del JWT cierra el canal, renueva por HTTP y reconecta. El cliente
  comparte la renovación con sus consultas; Web Locks coordina las pestañas.
- Revalidación de conexiones cada 5 segundos para detectar revocación externa,
  sesión vencida o usuario deshabilitado. Un error de base de datos desconecta
  y permite reintentar, sin afirmar que la contraseña es inválida.
- Reintentos de conexión con espera creciente entre 1 y 30 segundos. Desmontar
  el componente al salir cancela listeners y reintentos pendientes.

Este parche mantiene las consultas del dashboard cada 5 segundos. El canal
transmite únicamente el ciclo de sesión. El siguiente parche incorporará los
eventos de telemetría, estados y alarmas, recarga agrupada, resincronización al
reconectar y reconciliación HTTP cada 60 segundos. Que el canal esté conectado
no significa todavía que las mediciones se actualicen mediante eventos.

## 1. Aplicar

Detener API y frontend. Mantener PostgreSQL/TimescaleDB y Mosquitto levantados.
Desde la raíz, con el archivo descargado allí:

```bash
git apply --check 05-websocket-sesion.patch
git apply 05-websocket-sesion.patch
git diff --check
npm --prefix apps/api ci
npm --prefix apps/web ci
```

Si `git apply --check` falla, no forzar ni usar `--reject`: revisar el mensaje
antes de aplicar. Los package-lock están incluidos y no se actualizan versiones
existentes de paquetes; se agregan las dependencias de Socket.IO.

**No hay migración nueva.** Se reutiliza `auth_sessions.id` como sid estable.
Antes, cada refresh revocaba una fila y creaba otra; ahora rota el hash dentro
de la misma fila, con bloqueo y transacción. Los eventos REFRESH siguen auditados.
Los tokens de acceso antiguos sin sid requieren renovación o un nuevo login.
Las sesiones de refresh vigentes pueden renovarse sin borrar datos.

## 2. Configuración

En el `.env` que lee NestJS (raíz, o `apps/api/.env` si existe):

```dotenv
WEB_ORIGIN=http://localhost:3000
AUTH_COOKIE_SECURE=false
```

En `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

El origen WebSocket se obtiene de la URL de API. Solo si se necesita un origen
distinto, se puede definir `NEXT_PUBLIC_WS_URL=http://localhost:3001` en el web;
no agregar `/api/v1`, `/dashboard` ni `/socket.io` a esa variable.

Usar `localhost` consistentemente en el navegador y las variables. WEB_ORIGIN
incluye esquema y puerto y no lleva barra final. Web Locks requiere un contexto
seguro: localhost en desarrollo o HTTPS cuando se despliegue con Caddy. Los
navegadores sin Web Locks conservan la deduplicación dentro de cada pestaña,
pero no se garantiza coordinación de refresh entre distintas pestañas.

## 3. Pruebas automáticas

Desde la raíz, con API/frontend de desarrollo detenidos:

```bash
npm --prefix apps/api test -- --runInBand
npm --prefix apps/api run test:realtime
npm --prefix apps/web run lint
npm --prefix apps/web test
npm --prefix apps/web run build
git diff --check
```

Resultados esperados: 36 pruebas unitarias de API, 1 integración de sesión y
Socket.IO, y 21 pruebas web (10 autenticación, 3 dashboard y 8 ciclo de conexión).

`test:realtime` compila API y levanta un NestJS temporal en un puerto libre,
con controladores, guards, servicio de autenticación y gateway reales. Usa un
usuario aleatorio creado dentro de una transacción en la base local configurada;
revierte sus datos al terminar, incluso si falla. No requiere tu contraseña de
administrador y no revoca tus sesiones. La auditoría usa una secuencia y puede
dejar saltos de numeración aunque la transacción se revierta; es normal.
Requiere las migraciones existentes hasta 005 y acceso local a PostgreSQL.

La integración comprueba:

- Rechazo anónimo, firma inválida, sid ausente, usuario/sid incompatibles y
  orígenes no autorizados; login sin CSRF rechazado.
- Login HTTP y handshake con cookies; acceso de sesión por HTTP.
- Rotación con sid estable, rechazo de replay y rollback si falla la firma.
- Vencimiento real de un JWT corto, evento de expiración y desconexión.
- Logout cierra varias conexiones del mismo sid; access/refresh anteriores
  se rechazan y otra sesión independiente sigue válida.
- Deshabilitar el usuario impide HTTP y cierra sus conexiones al revalidar.

## 4. Comprobar en el navegador

Levantar cada aplicación en su terminal desde la raíz:

```bash
npm --prefix apps/api run start:dev
```

```bash
npm --prefix apps/web run dev
```

Abrir http://localhost:3000 e ingresar con `admin@tunupa.local` y tu contraseña.
Comprobar:

1. Aparece **Tiempo real: conectado** junto a los controles de sesión.
2. Recargar conserva la sesión y vuelve a conectar.
3. Abrir otra pestaña del mismo navegador y entrar al dashboard: conecta también.
4. Cerrar sesión en una pestaña devuelve ambas al login. Recargar sigue protegido.
5. Volver a ingresar, detener NestJS y observar reconexión. Reiniciar NestJS
   recupera el canal y las consultas si la sesión permanece válida.
6. Mantener dos pestañas abiertas hasta el vencimiento: una renovación HTTP
   permite que ambas continúen. Conservar el registro de Network para revisar.

Para una prueba local más corta, se puede cambiar temporalmente en la API:

```dotenv
AUTH_ACCESS_TTL_SECONDS=300
```

Reiniciar NestJS e iniciar una sesión nueva. El mínimo configurado es 300 segundos
(5 minutos). Al terminar, restaurar 900, reiniciar e iniciar otra sesión. El test
automático usa un JWT corto en su servidor aislado y no cambia tu configuración.

En Network → WS se observa `/socket.io/?EIO=4&transport=websocket` y el namespace
`/dashboard`. No buscar una ruta `/api/v1/dashboard` para la conexión Socket.IO.
No compartir cookies ni tokens al enviar capturas o registros.

Después de levantar API, repetir la comprobación HTTP ya conocida:

```bash
python3 scripts/auth/smoke_test.py
```

Se esperan los nueve OK. Esta prueba crea y cierra su propia sesión; no debe
cerrar la sesión de las pestañas del navegador.

## Eventos de sesión de esta entrega

| Evento | Datos | Acción del navegador |
| --- | --- | --- |
| `session.ready` | `version: 1`, `expiresAt` ISO UTC | Mostrar conectado tras la validación adicional del servidor |
| `session.expired` | `version: 1`, `code: ACCESS_EXPIRED` | Comprobar/renovar por HTTP y reconectar |
| `session.revoked` | `version: 1`, código de sesión inválida | Detener reconexión y volver al login |
| `session.unavailable` | `version: 1`, `code: SERVER_UNAVAILABLE` | Reintentar sin borrar la sesión por un fallo de infraestructura |

Los rechazos del handshake usan `connect_error.data.code`: AUTH_REQUIRED,
ACCESS_EXPIRED, SESSION_REVOKED, ORIGIN_FORBIDDEN o SERVER_UNAVAILABLE.
El rechazo del origen en el transporte puede aparecer como error genérico de
WebSocket antes de llegar al namespace; comprobar WEB_ORIGIN si persiste.

Los eventos de datos acordados (`telemetry.received`, `motor.status.changed`,
`alarm.changed`) siguen pendientes de la siguiente entrega. No se habilitan
comandos de escritura ni selección libre de salas desde el navegador.

## Alcance de despliegue y verificación realizada

Diseñado para una instancia NestJS en el beta. El cierre inmediato por logout
se notifica dentro de ese proceso; la revalidación consulta PostgreSQL. Antes
de escalar a varias instancias habrá que coordinar revocaciones y emisiones.
El acceso mantiene el alcance actual de la API; no agrega aislamiento multicliente.

Durante la preparación se comprobaron build/lint, pruebas unitarias, HTTP y
Socket.IO reales con QueryRunner de TypeORM sobre PostgreSQL embebido PGlite,
y navegador Chromium con Next.js de producción. El navegador probó login,
recarga, renovación real en dos pestañas y logout compartido; la lista de motores
usó una respuesta vacía de prueba. Se verificó rollback de los usuarios sintéticos.
La aceptación en tu PostgreSQL/TimescaleDB se ejecuta con `test:realtime`.

## Reversión del código

Con API y frontend detenidos, si no hay cambios posteriores sobre estos archivos:

```bash
git apply --reverse --check 05-websocket-sesion.patch
git apply --reverse 05-websocket-sesion.patch
npm --prefix apps/api ci
npm --prefix apps/web ci
```

No hay esquema que revertir. Reiniciar e iniciar sesión nuevamente. Si el check
falla, revisar las diferencias antes de revertir para conservar otros cambios.
