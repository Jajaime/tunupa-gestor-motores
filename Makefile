DB_MIGRATION_RUNNER ?= scripts/database/migrate.sh
DB_SERVICE ?= timescaledb
DB_TESTS_DIR ?= database/tests

.PHONY: \
	db-migrate-init \
	db-migrate-status \
	db-migrate-current \
	db-migrate-up \
	db-migrate-down \
	db-test \
	db-reset

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