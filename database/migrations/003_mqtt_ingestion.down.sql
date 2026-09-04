DROP INDEX IF EXISTS public.uq_alarms_open_device_type;

DROP TABLE IF EXISTS public.telemetry_ingestions;

DROP INDEX IF EXISTS public.ix_motors_last_telemetry;
DROP INDEX IF EXISTS public.ix_motors_operational_status;

ALTER TABLE public.motors
    DROP CONSTRAINT IF EXISTS ck_motors_operational_status,
    DROP COLUMN IF EXISTS last_telemetry_at,
    DROP COLUMN IF EXISTS operational_status;
