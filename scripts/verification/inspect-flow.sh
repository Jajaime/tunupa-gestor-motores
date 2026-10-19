#!/usr/bin/env bash
set -Eeuo pipefail

device_code="${1:-ESP32-DEMO-001}"
if [[ ! "$device_code" =~ ^[A-Za-z0-9_.-]{1,80}$ ]]; then
  echo 'Código de dispositivo inválido.' >&2
  exit 1
fi
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"

docker compose exec -T "${DB_SERVICE:-timescaledb}" sh -c '
  psql -X -v ON_ERROR_STOP=1 -v device_code="$1" \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB"
' sh "$device_code" < scripts/verification/inspect-flow.sql
