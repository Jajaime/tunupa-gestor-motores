#!/usr/bin/env bash

set -Eeuo pipefail

BACKUP_DIRECTORY="database/backups"
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
BACKUP_FILE="${BACKUP_DIRECTORY}/medicion_motor_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIRECTORY}"

echo "Creando respaldo de PostgreSQL..."

docker compose exec -T timescaledb sh -c '
  pg_dump \
    -v \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --format=custom \
    --no-owner \
    --no-privileges
' > "${BACKUP_FILE}"

if [[ ! -s "${BACKUP_FILE}" ]]; then
    echo "ERROR: el archivo de respaldo está vacío."
    rm -f "${BACKUP_FILE}"
    exit 1
fi

echo "Validando estructura del respaldo..."

docker compose exec -T timescaledb sh -c '
  pg_restore --list
' < "${BACKUP_FILE}" > /dev/null

echo "Respaldo creado correctamente:"
echo "${BACKUP_FILE}"
