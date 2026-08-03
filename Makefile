DB_SERVICE ?= timescaledb
DB_MIGRATIONS_DIR ?= database/migrations
DB_TESTS_DIR ?= database/tests

.PHONY: db-status db-migrate-up db-migrate-down db-test db-reset

db-status:
	docker compose exec $(DB_SERVICE) sh -c '\
		psql \
		-U "$$POSTGRES_USER" \
		-d "$$POSTGRES_DB" \
		-c "\dt public.*"'

db-migrate-up:
	docker compose exec -T $(DB_SERVICE) sh -c '\
		psql \
		-v ON_ERROR_STOP=1 \
		-U "$$POSTGRES_USER" \
		-d "$$POSTGRES_DB"' \
		< $(DB_MIGRATIONS_DIR)/001_initial_schema.up.sql

db-migrate-down:
	docker compose exec -T $(DB_SERVICE) sh -c '\
		psql \
		-v ON_ERROR_STOP=1 \
		-U "$$POSTGRES_USER" \
		-d "$$POSTGRES_DB"' \
		< $(DB_MIGRATIONS_DIR)/001_initial_schema.down.sql

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

db-reset: db-migrate-down db-migrate-up db-test