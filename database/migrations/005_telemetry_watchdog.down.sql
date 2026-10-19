BEGIN;
DROP INDEX public.ix_devices_telemetry_watchdog;
ALTER TABLE public.devices DROP COLUMN last_telemetry_received_at;
COMMIT;
