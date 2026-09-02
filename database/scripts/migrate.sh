#!/usr/bin/env bash

set -Eeuo pipefail

MIGRATIONS_DIRECTORY="database/migrations"

if [[ ! -d "${MIGRATIONS_DIRECTORY}" ]]; then
    echo "ERROR: no existe el directorio ${MIGRATIONS_DIRECTORY}."
    exit 1
fi

echo "Verificando conexión con PostgreSQL..."

docker compose exec -T timescaledb sh -c '
  psql \
    -v ON_ERROR_STOP=1 \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -c "SELECT 1;" \
    >/dev/null
'

echo "Asegurando tabla de control de migraciones..."

docker compose exec -T timescaledb sh -c '
  psql \
    -v ON_ERROR_STOP=1 \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -c "
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    "
'

migration_count=0
applied_count=0
skipped_count=0

shopt -s nullglob
migration_files=("${MIGRATIONS_DIRECTORY}"/*.up.sql)
shopt -u nullglob

if [[ "${#migration_files[@]}" -eq 0 ]]; then
    echo "No se encontraron migraciones en ${MIGRATIONS_DIRECTORY}."
    exit 0
fi

for migration_file in "${migration_files[@]}"; do
    migration_count=$((migration_count + 1))

    filename="$(basename "${migration_file}")"

    if [[ ! "${filename}" =~ ^([0-9]+)_(.+)\.up\.sql$ ]]; then
        echo "ERROR: nombre de migración inválido: ${filename}"
        echo "Formato esperado: 001_nombre_migracion.up.sql"
        exit 1
    fi

    version="${BASH_REMATCH[1]}"
    name="${BASH_REMATCH[2]}"
    checksum="$(sha256sum "${migration_file}" | awk '{print $1}')"

    registered_checksum="$(
        docker compose exec -T timescaledb sh -c "
        psql \
            -v ON_ERROR_STOP=1 \
            -U \"\$POSTGRES_USER\" \
            -d \"\$POSTGRES_DB\" \
            -tAc \"
            SELECT checksum
            FROM public.schema_migrations
            WHERE version = '${version}';
            \"
        " | tr -d '[:space:]'
    )"

    if [[ -n "${registered_checksum}" ]]; then
        if [[ "${registered_checksum}" != "${checksum}" ]]; then
            echo "ERROR: la migración ${version} fue modificada después de aplicarse."
            echo "Archivo:              ${filename}"
            echo "Checksum registrado: ${registered_checksum}"
            echo "Checksum actual:     ${checksum}"
            exit 1
        fi

        echo "Migración ${version} (${name}) ya aplicada. Se omite."
        skipped_count=$((skipped_count + 1))
        continue
    fi

    echo "Aplicando migración ${version}: ${name}"

    {
        echo "BEGIN;"
        cat "${migration_file}"
        echo
        cat <<'SQL'
INSERT INTO public.schema_migrations (
    version,
    name,
    checksum
)
VALUES (
    :'migration_version',
    :'migration_name',
    :'migration_checksum'
);
COMMIT;
SQL
    } | docker compose exec -T timescaledb sh -c "
          psql \
            -v ON_ERROR_STOP=1 \
            -U \"\$POSTGRES_USER\" \
            -d \"\$POSTGRES_DB\" \
            -v migration_version=\"${version}\" \
            -v migration_name=\"${name}\" \
            -v migration_checksum=\"${checksum}\"
        "

    echo "Migración ${version} aplicada y registrada correctamente."
    applied_count=$((applied_count + 1))
done

echo
echo "Proceso de migraciones completado."
echo "Migraciones detectadas: ${migration_count}"
echo "Migraciones aplicadas:  ${applied_count}"
echo "Migraciones omitidas:   ${skipped_count}"
