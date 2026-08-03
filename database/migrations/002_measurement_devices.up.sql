BEGIN;

CREATE TABLE public.measurement_devices (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    device_code VARCHAR(100) NOT NULL,
    device_name VARCHAR(150) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'inactive',
    installed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_measurement_devices_device_code
        UNIQUE (device_code),

    CONSTRAINT chk_measurement_devices_status
        CHECK (status IN ('inactive', 'active', 'maintenance', 'retired'))
);

CREATE INDEX idx_measurement_devices_status
    ON public.measurement_devices (status);

COMMENT ON TABLE public.measurement_devices IS
    'Dispositivos físicos utilizados para capturar y transmitir mediciones de motores eléctricos.';

COMMENT ON COLUMN public.measurement_devices.device_code IS
    'Identificador único y estable asignado al dispositivo.';

COMMENT ON COLUMN public.measurement_devices.status IS
    'Estado operativo: inactive, active, maintenance o retired.';

COMMIT;
