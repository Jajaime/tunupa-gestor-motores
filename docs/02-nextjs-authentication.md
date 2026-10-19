# Punto 2: inicio de sesión en Next.js

Patch preparado contra el frontend del commit
`2c783c46090df5e7933d1d225a85017ea52f17af`.
Es compatible con el patch del punto 1, que agrega otros archivos.

## Comportamiento

- `/login` presenta el formulario de correo y contraseña.
- `/` comprueba la sesión antes de montar el dashboard o iniciar sus consultas.
- La API recibe cookies mediante `credentials: 'include'`.
- Login, refresh y logout obtienen CSRF y envían `X-CSRF-Token`.
- Un 401 de una consulta protegida intenta renovar y repetir la consulta una vez.
- Consultas simultáneas comparten el refresh; los 401 tardíos no disparan otro.
- Una sesión inválida devuelve al login y desmonta el dashboard, deteniendo sus timers.
- Al recargar se recupera la sesión desde NestJS; no se guardan tokens en localStorage.
- El dashboard muestra la identidad y permite cerrar sesión. Si el access token
  expiró, logout intenta renovar antes de cerrar la sesión en el backend.
- Los fallos de red muestran un mensaje y permiten reintentar; no se interpretan
  como credenciales incorrectas. No se confirma logout cuando falla la conexión.

La protección de datos sigue en los guards de NestJS. El frontend administra
la navegación y visibilidad; no incorpora Server Actions ni endpoints nuevos.
No implementa autorización por roles, aislamiento por cliente ni WebSocket.

## Aplicación

Desde la raíz del repositorio, con el patch descargado en esa carpeta:

```bash
git apply --check 02-login-nextjs.patch
git apply 02-login-nextjs.patch
git diff --check
```

No agrega dependencias. Las pruebas `test:auth` requieren Node 24, la versión
usada por este proyecto, porque ejecutan el cliente TypeScript con Node.

## Configuración local

En `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

En la configuración de NestJS:

```dotenv
WEB_ORIGIN=http://localhost:3000
AUTH_COOKIE_SECURE=false
```

`AUTH_COOKIE_SECURE=false` corresponde exclusivamente al HTTP local.
Usar `localhost` tanto en navegador como en la URL de API, sin mezclarlo con
`127.0.0.1`. Reiniciar Next.js al cambiar `NEXT_PUBLIC_API_URL`.
Si se usa otro puerto de frontend, ajustar también `WEB_ORIGIN`.

## Validación

Dejar NestJS funcionando en su terminal. En otra:

```bash
cd apps/web
npm run lint
npm test
npm run build
npm run dev
```

`npm test` realiza typecheck y nueve pruebas del cliente HTTP con fetch simulado.
No necesita credenciales ni una base de datos.

Abrir `http://localhost:3000` y comprobar:

1. En una ventana privada sin sesión, aparece `/login` sin datos de motores.
2. Un intento con contraseña incorrecta muestra error y conserva el formulario.
3. Login con el administrador existente permite ingresar al dashboard.
4. Recargar mantiene el acceso. Abrir `/login` con sesión vuelve al dashboard.
5. En DevTools > Application > Cookies, eliminar solo `tunupa_access`.
   La siguiente consulta renueva la sesión y sigue mostrando el dashboard.
6. Eliminar `tunupa_access` y `tunupa_refresh` vuelve al login en la siguiente
   consulta. El polling se detiene al desmontarse el dashboard.
7. Volver a ingresar y pulsar Cerrar sesión. Regresa al login; recargar `/`
   no vuelve a mostrar datos privados.
8. Con el dashboard abierto, detener la API: aparece un error. Restaurarla
   permite recuperar las consultas. Al recargar con la API apagada, aparece
   Reintentar conexión; no se muestra el formulario como si la sesión fuese inválida.

Eliminar la cookie de acceso comprueba la recuperación ante ausencia del token;
la prueba real de vencimiento se puede realizar manteniendo abierta la sesión
durante su TTL actual, sin cambiar ni acortar la configuración del backend.

Las pruebas de cliente no demuestran las políticas CORS/SameSite del navegador.
La aceptación del punto 2 requiere estas comprobaciones con la API local real.
Se conserva la actualización HTTP cada cinco segundos; el indicador fijo de
conectividad y la detección de telemetría vencida se abordan en el punto 3.

## Commit después de validar

```bash
git diff --check
git add apps/web/package.json apps/web/src/app/globals.css \
  apps/web/src/app/layout.tsx apps/web/src/app/page.tsx \
  apps/web/src/app/login/page.tsx apps/web/src/components/auth \
  apps/web/src/components/dashboard/dashboard.tsx \
  apps/web/src/lib/api.ts apps/web/src/lib/types.ts \
  apps/web/tests/auth-api.test.mjs docs/02-nextjs-authentication.md
git commit -m "feat(web): integrate session login and protected dashboard"
```
