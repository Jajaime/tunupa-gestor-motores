BEGIN;

ALTER TABLE public.devices
    ADD COLUMN last_telemetry_received_at TIMESTAMPTZ;

COMMENT ON COLUMN public.devices.last_telemetry_received_at IS
    'Hora del servidor al procesar la última telemetría válida no duplicada.';

UPDATE public.devices AS d
SET last_telemetry_received_at = (
    SELECT i.received_at
    FROM public.telemetry_ingestions AS i
    WHERE i.device_id = d.id
    ORDER BY i.received_at DESC
    LIMIT 1
);

CREATE INDEX ix_devices_telemetry_watchdog
    ON public.devices (
        COALESCE(last_telemetry_received_at, last_connection_at), motor_id
    )
    WHERE status = 'ACTIVE' AND motor_id IS NOT NULL;

COMMIT;
