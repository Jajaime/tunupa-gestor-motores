DB_MIGRATION_RUNNER ?= scripts/database/migrate.sh
DB_SERVICE ?= timescaledb
DB_TESTS_DIR ?= database/tests

.PHONY: db-up db-down db-logs db-migrate db-backup db-restore-test db-clean-restore-test

db-up:
	docker compose up -d timescaledb

db-down:
	docker compose down

db-logs:
	docker compose logs -f timescaledb

db-migrate:
	$(DB_MIGRATION_RUNNER) up

db-backup:
	./scripts/database/backup.sh

db-restore-test:
	./scripts/database/restore-test.sh

db-clean-restore-test:
	docker compose exec -T timescaledb sh -c '\
	  psql \
	    -v ON_ERROR_STOP=1 \
	    -U "$$POSTGRES_USER" \
	    -d postgres \
	    -c "DROP DATABASE IF EXISTS medicion_motor_restore_test WITH (FORCE);"'

db-migrate-init:
	$(DB_MIGRATION_RUNNER) init

db-migrate-status:
	$(DB_MIGRATION_RUNNER) status

db-migrate-current:
	$(DB_MIGRATION_RUNNER) current

db-migrate-up:
	$(DB_MIGRATION_RUNNER) up

db-migrate-down:
	$(DB_MIGRATION_RUNNER) down

db-test:
	docker compose exec -T $(DB_SERVICE) sh -c '\
		psql \
		-v ON_ERROR_STOP=1 \
		-U "$$POSTGRES_USER" \
		-d "$$POSTGRES_DB"' \
		< $(DB_TESTS_DIR)/001_initial_schema_smoke_test.sql
	docker compose exec -T $(DB_SERVICE) sh -c '\
		psql \
		-v ON_ERROR_STOP=1 \
		-U "$$POSTGRES_USER" \
		-d "$$POSTGRES_DB"' \
		< $(DB_TESTS_DIR)/002_reject_invalid_relationship.sql

db-reset:
	$(DB_MIGRATION_RUNNER) down
	$(DB_MIGRATION_RUNNER) up
	$(MAKE) db-test

db-seed:
	./scripts/database/seed.sh

db-seed-clean:
	./scripts/database/seed-clean.sh