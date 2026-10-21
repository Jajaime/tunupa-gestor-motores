#!/usr/bin/env bash
set -Eeuo pipefail

# Protección: jamás ejecutar migraciones de este script contra la BD local/VPS.
# El servicio CI usa un contenedor efímero en el runner de GitHub.
if [[ "${GITHUB_ACTIONS:-}" != "true" ||
      "${POSTGRES_HOST:-}" != "127.0.0.1" ||
      "${POSTGRES_DB:-}" != "tunupa_ci" ||
      "${POSTGRES_USER:-}" != "tunupa_ci" ]]; then
  echo "ERROR: este script solo se permite en GitHub Actions con la BD efímera tunupa_ci." >&2
  exit 1
fi

: "${POSTGRES_PASSWORD:?Falta contraseña CI de prueba}"
export PGHOST="$POSTGRES_HOST"
export PGPORT="${POSTGRES_PORT:-5432}"
export PGDATABASE="$POSTGRES_DB"
export PGUSER="$POSTGRES_USER"
export PGPASSWORD="$POSTGRES_PASSWORD"

shopt -s nullglob
files=(database/migrations/*.up.sql)
if (( ${#files[@]} < 5 )); then
  echo "ERROR: no se encontraron todas las migraciones esperadas (001-005)." >&2
  exit 1
fi

# Instancia limpia: ejecutar los archivos reales en orden, abortando ante error.
for migration in "${files[@]}"; do
  echo "Applying: $(basename "$migration")"
  psql -X -v ON_ERROR_STOP=1 -q -f "$migration"
done

# Fallar si no se instaló la extensión, la hypertable o la autenticación.
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    RAISE EXCEPTION 'TimescaleDB extension is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'telemetry') THEN
    RAISE EXCEPTION 'telemetry hypertable is missing';
  END IF;
  IF to_regclass('public.auth_sessions') IS NULL OR to_regclass('public.telemetry_ingestions') IS NULL THEN
    RAISE EXCEPTION 'Expected auth/ingestion tables are missing';
  END IF;
END $$;
SQL
printf 'OK: migraciones aplicadas en base efímera de CI.\n'
