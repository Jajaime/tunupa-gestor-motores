# Punto 1: verificar autenticación del backend

Patch preparado contra `main` en el commit
`2c783c46090df5e7933d1d225a85017ea52f17af`.
Agrega una prueba manual de la API local. Requiere Python 3; no usa paquetes externos.
No modifica controladores, dependencias ni migraciones.

## 1. Base de datos

Desde la raíz del repositorio:

```bash
docker compose up -d timescaledb mosquitto
make db-migrate-status
```

La migración `004 authentication` debe figurar como aplicada. Si está pendiente,
aplicar las migraciones pendientes y consultar nuevamente:

```bash
make db-migrate
make db-migrate-status
```

Verificar las tablas y la existencia de al menos un administrador activo,
sin mostrar contraseñas ni hashes:

```bash
docker compose exec -T timescaledb sh -c '
  psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
' <<'SQL'
SELECT version, name FROM public.schema_migrations WHERE version = '004';
SELECT to_regclass('public.users') AS users,
       to_regclass('public.auth_sessions') AS auth_sessions,
       to_regclass('public.auth_events') AS auth_events;
SELECT count(*) AS administradores_activos
FROM public.users WHERE role = 'ADMIN' AND status = 'ACTIVE';
SQL
```

Si ya existe el administrador y conoces sus credenciales, úsalo directamente.
Si no existe, el siguiente comando solicita los datos en la terminal. El script
existente `auth:create-admin` actualiza contraseña y rol si el correo ya existe;
usar el correo de la cuenta que se desea crear o actualizar deliberadamente.

```bash
(
  cd apps/api || exit
  read -r -p 'Correo del administrador: ' ADMIN_EMAIL
  read -r -s -p 'Contraseña (mínimo 14 caracteres): ' ADMIN_PASSWORD
  printf '\n'
  read -r -p 'Nombre del administrador: ' ADMIN_DISPLAY_NAME
  export ADMIN_EMAIL ADMIN_PASSWORD ADMIN_DISPLAY_NAME
  npm run auth:create-admin
)
```

## 2. Backend

La configuración local debe incluir un `AUTH_ACCESS_SECRET` aleatorio,
`AUTH_COOKIE_SECURE=false` para HTTP local y `WEB_ORIGIN=http://localhost:3000`.
Mantener el secreto estable entre ejecuciones. Las variables se cargan desde
`.env` de la API y luego desde `.env` de la raíz; revisar posibles diferencias.

En una terminal:

```bash
cd apps/api
npm run build
npm run start:dev
```

## 3. Prueba manual

En otra terminal, desde la raíz del repositorio:

```bash
python3 scripts/auth/smoke_test.py
```

Si la API utiliza otro puerto local:

```bash
python3 scripts/auth/smoke_test.py --api-url http://localhost:3005/api/v1
```

Solicita correo y contraseña de forma interactiva. No imprime tokens, hashes
ni contraseñas; conserva las cookies solo en memoria. Las respuestas inesperadas
detienen la prueba con salida distinta de cero. No reintenta logins fallidos.

Comprobaciones esperadas:

| Salida | Comprobación |
| --- | --- |
| OK 01 | Sesión y dashboard anónimos rechazados con 401 |
| OK 02 | Token y cookie CSRF coinciden |
| OK 03 | Login sin cabecera CSRF rechazado con 403 |
| OK 04 | Login válido de administrador y cookies HttpOnly |
| OK 05 | Sesión y listado de motores accesibles con autenticación |
| OK 06 | Refresh válido, token rotado y sesión consultable |
| OK 07 | Refresh anterior rechazado |
| OK 08 | Logout 204, cookies eliminadas y acceso posterior rechazado |
| OK 09 | Refresh revocado por logout rechazado |

Un listado vacío de motores es válido para esta prueba; no demuestra ingesta MQTT.
El recorrido registra eventos de autenticación y sesiones en las tablas existentes.
Al finalizar cierra la sesión que abrió; ante un fallo intenta cerrarla.

## Alcance

Cerrar este punto cuando la migración y las tablas estén verificadas, exista
el administrador, compile el backend y aparezcan los nueve OK.
La prueba confirma el flujo HTTP local; no demuestra CORS/SameSite del navegador,
vencimiento real del access token, bloqueo por intentos, acceso por roles o WebSocket.
Los guards actuales verifican un JWT sin consultar revocación de sesión:
el logout elimina las cookies del cliente y revoca el refresh, pero una copia
previa del access token puede seguir válida hasta expirar. La prueba posterior
al logout usa las cookies actualizadas; no afirma revocación inmediata del JWT.

Para revisión comparte el estado de migraciones, el conteo de administradores y
las líneas OK/FALLO. No compartir `.env`, contraseña ni cookies.

## Commit después de verificar

```bash
git diff --check
git add scripts/auth/smoke_test.py docs/authentication-verification.md
git commit -m "test(auth): add manual authentication smoke check"
```
