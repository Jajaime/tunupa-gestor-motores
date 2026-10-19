# 07 — Grafana base (desarrollo local)

## Alcance

Se añade solo `grafana` a Compose; NestJS, Next.js y Mosquitto siguen como hasta ahora. El volumen `grafana_data` conserva la base interna de Grafana. El datasource se aprovisiona desde `infrastructure/grafana/provisioning/datasources/timescaledb.yaml` y usa `grafana_reader`.

## Preparación

1. En `.env` (no versionado), establecer `GRAFANA_ADMIN_USER`, `GRAFANA_ADMIN_PASSWORD`, `GRAFANA_DB_PASSWORD` y opcional `GRAFANA_PORT=3001`. Usar contraseñas fuertes y diferentes. El valor de `GRAFANA_DB_PASSWORD` debe coincidir con la contraseña de `grafana_reader` en PostgreSQL.
2. Crear el rol en la base **existente**. La carpeta `/docker-entrypoint-initdb.d` no se ejecuta nuevamente sobre volúmenes PostgreSQL ya inicializados. Abrir `docker compose exec timescaledb sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'` y ejecutar:

```sql
CREATE ROLE grafana_reader LOGIN CONNECTION LIMIT 5;
\password grafana_reader
GRANT CONNECT ON DATABASE nombre_real_de_la_base TO grafana_reader;
GRANT USAGE ON SCHEMA public TO grafana_reader;
GRANT SELECT ON TABLE public.telemetry, public.motors, public.devices, public.measurement_devices, public.alarms TO grafana_reader;
ALTER ROLE grafana_reader SET default_transaction_read_only = on;
ALTER ROLE grafana_reader SET statement_timeout = '15s';
```

Sustituir `nombre_real_de_la_base` por el valor `POSTGRES_DB`, no por un ejemplo. Ejecutar solo una vez `CREATE ROLE`: si el rol existe, omitir esa línea y usar `\password` para cambiar su clave. Para restringir aún más, se pueden reducir las tablas autorizadas al diseñar el dashboard. Para tablas que no existan, inspeccionar `\dt public.*` y ajustar la lista antes de GRANT.

3. `docker compose config --quiet` y `docker compose up -d grafana`.
4. Abrir <http://localhost:3001> (o el puerto configurado), ingresar con el usuario administrador propio de Grafana y entrar a **Connections → Data sources → Tunupa TimescaleDB → Test**.
5. Comprobar el acceso con una consulta SQL en **Explore**:

```sql
SELECT COUNT(*) AS total FROM public.telemetry;
```

## Seguridad y persistencia

- El puerto web de Grafana solo se publica en `127.0.0.1`; no se expone al exterior. En producción usar proxy TLS y configuración explícita.
- La contraseña del datasource se inyecta en el contenedor por variable y no se guarda en Git. No imprimir `docker compose config` ni compartir `docker inspect` sin ocultar secretos.
- El datasource usa un rol limitado a consultas y la interfaz de Grafana requiere autenticación. **No** utilizar el usuario administrador de PostgreSQL en Grafana.
- `docker compose restart grafana` conserva configuraciones. No usar `docker compose down -v`: elimina los volúmenes nombrados, incluido TimescaleDB.
- Los dashboards y sus archivos versionados se incorporarán en el parche 08. Los dashboards creados manualmente se conservan en el volumen, pero no quedan versionados.
