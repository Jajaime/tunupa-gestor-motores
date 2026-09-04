#!/usr/bin/env bash

set -Eeuo pipefail

BACKUP_DIRECTORY="database/backups"
RESTORE_DATABASE="medicion_motor_restore_test"

BACKUP_FILE="$(
  find "${BACKUP_DIRECTORY}" \
    -maxdepth 1 \
    -type f \
    -name '*.dump' \
    -printf '%T@ %p\n' |
  sort -nr |
  head -n 1 |
  cut -d' ' -f2-
)"

if [[ -z "${BACKUP_FILE}" || ! -f "${BACKUP_FILE}" ]]; then
    echo "ERROR: no se encontró ningún respaldo en ${BACKUP_DIRECTORY}."
    exit 1
fi

echo "Respaldo seleccionado:"
echo "${BACKUP_FILE}"

echo "Eliminando base temporal anterior, si existe..."

docker compose exec -T timescaledb sh -c "
  psql \
    -v ON_ERROR_STOP=1 \
    -U \"\$POSTGRES_USER\" \
    -d postgres \
    -c \"DROP DATABASE IF EXISTS ${RESTORE_DATABASE} WITH (FORCE);\"
"

echo "Creando base temporal..."

docker compose exec -T timescaledb sh -c "
  psql \
    -v ON_ERROR_STOP=1 \
    -U \"\$POSTGRES_USER\" \
    -d postgres \
    -c \"CREATE DATABASE ${RESTORE_DATABASE};\"
"

echo "Activando TimescaleDB en la base temporal..."

docker compose exec -T timescaledb sh -c "
  psql \
    -v ON_ERROR_STOP=1 \
    -U \"\$POSTGRES_USER\" \
    -d \"${RESTORE_DATABASE}\" \
    -c \"CREATE EXTENSION IF NOT EXISTS timescaledb;\"
"

echo "Preparando TimescaleDB para la restauración..."

docker compose exec -T timescaledb sh -c "
  psql \
    -v ON_ERROR_STOP=1 \
    -U \"\$POSTGRES_USER\" \
    -d \"${RESTORE_DATABASE}\" \
    -c \"SELECT timescaledb_pre_restore();\"
"

restore_status=0

docker compose exec -T timescaledb sh -c "
  pg_restore \
    -v \
    --exit-on-error \
    --no-owner \
    --no-privileges \
    -U \"\$POSTGRES_USER\" \
    -d \"${RESTORE_DATABASE}\"
" < "${BACKUP_FILE}" || restore_status=$?

echo "Finalizando el modo de restauración de TimescaleDB..."

docker compose exec -T timescaledb sh -c "
  psql \
    -v ON_ERROR_STOP=1 \
    -U \"\$POSTGRES_USER\" \
    -d \"${RESTORE_DATABASE}\" \
    -c \"SELECT timescaledb_post_restore();\"
"

if [[ "${restore_status}" -ne 0 ]]; then
    echo "ERROR: la restauración terminó con errores."
    exit "${restore_status}"
fi

echo "Actualizando estadísticas..."

docker compose exec -T timescaledb sh -c "
  psql \
    -v ON_ERROR_STOP=1 \
    -U \"\$POSTGRES_USER\" \
    -d \"${RESTORE_DATABASE}\" \
    -c \"ANALYZE;\"
"

echo "Verificando las tablas restauradas..."

docker compose exec -T timescaledb sh -c "
  psql \
    -v ON_ERROR_STOP=1 \
    -U \"\$POSTGRES_USER\" \
    -d \"${RESTORE_DATABASE}\" \
    -c \"
      SELECT
        schemaname,
        tablename
      FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    \"
"

echo "Verificando migraciones registradas..."

docker compose exec -T timescaledb sh -c "
  psql \
    -v ON_ERROR_STOP=1 \
    -U \"\$POSTGRES_USER\" \
    -d \"${RESTORE_DATABASE}\" \
    -c \"
      SELECT *
      FROM public.schema_migrations
      ORDER BY version;
    \"
"

echo "Restauración de prueba completada correctamente."
echo "Base temporal: ${RESTORE_DATABASE}"
