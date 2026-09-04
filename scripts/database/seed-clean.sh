#!/usr/bin/env bash

set -Eeuo pipefail

SEED_FILE="database/seeds/001_development_seed.down.sql"

if [[ ! -f "${SEED_FILE}" ]]; then
    echo "ERROR: no existe ${SEED_FILE}."
    exit 1
fi

echo "Eliminando datos semilla de desarrollo..."

docker compose exec -T timescaledb sh -c '
  psql \
    -v ON_ERROR_STOP=1 \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB"
' < "${SEED_FILE}"

echo "Datos semilla eliminados correctamente."