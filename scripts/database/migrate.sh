#!/usr/bin/env bash

set -Eeuo pipefail

DB_SERVICE="${DB_SERVICE:-timescaledb}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-database/migrations}"

TRACKING_TABLE="schema_migrations"

usage() {
    cat <<'USAGE'
Usage:
  scripts/database/migrate.sh init
  scripts/database/migrate.sh status
  scripts/database/migrate.sh baseline VERSION
  scripts/database/migrate.sh up
  scripts/database/migrate.sh down
  scripts/database/migrate.sh current

Commands:
  init                Create the schema_migrations table.
  status              Show all migrations and their state.
  baseline VERSION    Register an already-applied migration.
  up                  Apply every pending migration.
  down                Revert the latest applied migration.
  current             Show the latest applied migration.
USAGE
}

db_psql() {
    docker compose exec -T "$DB_SERVICE" sh -c '
        psql \
          -X \
          -v ON_ERROR_STOP=1 \
          -U "$POSTGRES_USER" \
          -d "$POSTGRES_DB"
    '
}

db_query() {
    local sql="$1"

    docker compose exec -T "$DB_SERVICE" sh -c '
        psql \
          -X \
          -A \
          -t \
          -v ON_ERROR_STOP=1 \
          -U "$POSTGRES_USER" \
          -d "$POSTGRES_DB"
    ' <<< "$sql"
}

escape_sql_literal() {
    printf '%s' "$1" | sed "s/'/''/g"
}

validate_version() {
    local version="$1"

    if [[ ! "$version" =~ ^[0-9]{3,}$ ]]; then
        echo "Error: invalid migration version: $version" >&2
        echo "Expected a numeric version such as 001 or 002." >&2
        exit 1
    fi
}

ensure_dependencies() {
    command -v docker >/dev/null 2>&1 || {
        echo "Error: docker is not installed or not available." >&2
        exit 1
    }

    command -v sha256sum >/dev/null 2>&1 || {
        echo "Error: sha256sum is not available." >&2
        exit 1
    }

    [[ -d "$MIGRATIONS_DIR" ]] || {
        echo "Error: migrations directory not found: $MIGRATIONS_DIR" >&2
        exit 1
    }

    docker compose ps --status running "$DB_SERVICE" \
        --quiet | grep -q . || {
        echo "Error: service '$DB_SERVICE' is not running." >&2
        exit 1
    }
}

init_tracking_table() {
    db_psql <<SQL
CREATE TABLE IF NOT EXISTS public.${TRACKING_TABLE} (
    version VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_schema_migrations_version
        CHECK (version ~ '^[0-9]{3,}$'),

    CONSTRAINT ck_schema_migrations_checksum
        CHECK (checksum ~ '^[a-f0-9]{64}$')
);
SQL
}

get_up_files() {
    find "$MIGRATIONS_DIR" \
        -maxdepth 1 \
        -type f \
        -name '*.up.sql' \
        -print |
        sort
}

migration_version() {
    local file="$1"
    local filename

    filename="$(basename "$file")"
    printf '%s\n' "${filename%%_*}"
}

migration_name() {
    local file="$1"
    local filename
    local without_version
    local without_suffix

    filename="$(basename "$file")"
    without_version="${filename#*_}"
    without_suffix="${without_version%.up.sql}"

    printf '%s\n' "$without_suffix"
}

migration_checksum() {
    local file="$1"
    sha256sum "$file" | awk '{print $1}'
}

migration_is_applied() {
    local version="$1"
    local result

    result="$(
        db_query "
            SELECT EXISTS (
                SELECT 1
                FROM public.${TRACKING_TABLE}
                WHERE version = '$(escape_sql_literal "$version")'
            );
        "
    )"

    [[ "$result" == "t" ]]
}

stored_checksum() {
    local version="$1"

    db_query "
        SELECT checksum
        FROM public.${TRACKING_TABLE}
        WHERE version = '$(escape_sql_literal "$version")';
    "
}

register_migration() {
    local version="$1"
    local name="$2"
    local checksum="$3"

    db_psql <<SQL
INSERT INTO public.${TRACKING_TABLE} (
    version,
    name,
    checksum
)
VALUES (
    '$(escape_sql_literal "$version")',
    '$(escape_sql_literal "$name")',
    '$(escape_sql_literal "$checksum")'
);
SQL
}

verify_applied_checksum() {
    local version="$1"
    local file="$2"
    local expected
    local actual

    expected="$(stored_checksum "$version")"
    actual="$(migration_checksum "$file")"

    if [[ "$expected" != "$actual" ]]; then
        echo "Error: migration $version was modified after being applied." >&2
        echo "Stored checksum:  $expected" >&2
        echo "Current checksum: $actual" >&2
        exit 1
    fi
}

apply_migration() {
    local file="$1"
    local version
    local name
    local checksum

    version="$(migration_version "$file")"
    name="$(migration_name "$file")"
    checksum="$(migration_checksum "$file")"

    validate_version "$version"

    if migration_is_applied "$version"; then
        verify_applied_checksum "$version" "$file"
        echo "Already applied: $version $name"
        return
    fi

    echo "Applying: $version $name"

    db_psql < "$file"

    register_migration "$version" "$name" "$checksum"

    echo "Applied: $version $name"
}

baseline_migration() {
    local requested_version="$1"
    local file=""
    local candidate
    local version
    local name
    local checksum

    validate_version "$requested_version"
    init_tracking_table

    while IFS= read -r candidate; do
        version="$(migration_version "$candidate")"

        if [[ "$version" == "$requested_version" ]]; then
            file="$candidate"
            break
        fi
    done < <(get_up_files)

    if [[ -z "$file" ]]; then
        echo "Error: up migration not found for version $requested_version." >&2
        exit 1
    fi

    if migration_is_applied "$requested_version"; then
        verify_applied_checksum "$requested_version" "$file"
        echo "Migration $requested_version is already registered."
        return
    fi

    name="$(migration_name "$file")"
    checksum="$(migration_checksum "$file")"

    register_migration "$requested_version" "$name" "$checksum"

    echo "Baseline registered: $requested_version $name"
}

show_status() {
    local file
    local version
    local name
    local state

    init_tracking_table

    printf '%-10s %-35s %-12s\n' "VERSION" "NAME" "STATE"
    printf '%-10s %-35s %-12s\n' "-------" "----" "-----"

    while IFS= read -r file; do
        version="$(migration_version "$file")"
        name="$(migration_name "$file")"

        validate_version "$version"

        if migration_is_applied "$version"; then
            verify_applied_checksum "$version" "$file"
            state="applied"
        else
            state="pending"
        fi

        printf '%-10s %-35s %-12s\n' "$version" "$name" "$state"
    done < <(get_up_files)
}

apply_pending() {
    local file

    init_tracking_table

    while IFS= read -r file; do
        apply_migration "$file"
    done < <(get_up_files)
}

latest_applied_version() {
    db_query "
        SELECT version
        FROM public.${TRACKING_TABLE}
        ORDER BY version DESC
        LIMIT 1;
    "
}

revert_latest() {
    local version
    local up_file
    local down_file
    local name

    init_tracking_table

    version="$(latest_applied_version)"

    if [[ -z "$version" ]]; then
        echo "No applied migrations to revert."
        return
    fi

    up_file="$(
        find "$MIGRATIONS_DIR" \
            -maxdepth 1 \
            -type f \
            -name "${version}_*.up.sql" \
            -print |
            head -n 1
    )"

    down_file="$(
        find "$MIGRATIONS_DIR" \
            -maxdepth 1 \
            -type f \
            -name "${version}_*.down.sql" \
            -print |
            head -n 1
    )"

    if [[ -z "$up_file" ]]; then
        echo "Error: up migration not found for version $version." >&2
        exit 1
    fi

    if [[ -z "$down_file" ]]; then
        echo "Error: down migration not found for version $version." >&2
        exit 1
    fi

    verify_applied_checksum "$version" "$up_file"

    name="$(migration_name "$up_file")"

    echo "Reverting: $version $name"

    db_psql < "$down_file"

    db_psql <<SQL
DELETE FROM public.${TRACKING_TABLE}
WHERE version = '$(escape_sql_literal "$version")';
SQL

    echo "Reverted: $version $name"
}

show_current() {
    local version

    init_tracking_table
    version="$(latest_applied_version)"

    if [[ -z "$version" ]]; then
        echo "No migrations applied."
        return
    fi

    db_psql <<SQL
SELECT
    version,
    name,
    checksum,
    applied_at
FROM public.${TRACKING_TABLE}
WHERE version = '$(escape_sql_literal "$version")';
SQL
}

main() {
    local command="${1:-}"

    ensure_dependencies

    case "$command" in
        init)
            init_tracking_table
            echo "Migration tracking initialized."
            ;;

        status)
            show_status
            ;;

        baseline)
            if [[ $# -ne 2 ]]; then
                usage
                exit 1
            fi

            baseline_migration "$2"
            ;;

        up)
            apply_pending
            ;;

        down)
            revert_latest
            ;;

        current)
            show_current
            ;;

        *)
            usage
            exit 1
            ;;
    esac
}

main "$@"
