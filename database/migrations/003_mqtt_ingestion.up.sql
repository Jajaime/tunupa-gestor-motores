ALTER TABLE public.motors
    ADD COLUMN operational_status VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN last_telemetry_at TIMESTAMPTZ;

ALTER TABLE public.motors
    ADD CONSTRAINT ck_motors_operational_status
    CHECK (
        operational_status IN (
            'UNKNOWN',
            'RUNNING',
            'WARNING',
            'CRITICAL',
            'OFFLINE'
        )
    );

COMMENT ON COLUMN public.motors.operational_status IS
    'Estado operativo calculado a partir de telemetría y conectividad.';

COMMENT ON COLUMN public.motors.last_telemetry_at IS
    'Fecha de la última telemetría válida procesada.';

CREATE INDEX ix_motors_operational_status
    ON public.motors (operational_status);

CREATE INDEX ix_motors_last_telemetry
    ON public.motors (last_telemetry_at DESC)
    WHERE last_telemetry_at IS NOT NULL;

CREATE TABLE public.telemetry_ingestions (
    message_id UUID PRIMARY KEY,
    device_id UUID NOT NULL,
    motor_id UUID NOT NULL,
    topic VARCHAR(255) NOT NULL,
    measured_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    payload JSONB NOT NULL,

    CONSTRAINT ck_telemetry_ingestions_topic_not_empty
        CHECK (length(trim(topic)) > 0),

    CONSTRAINT ck_telemetry_ingestions_payload_object
        CHECK (jsonb_typeof(payload) = 'object'),

    CONSTRAINT fk_telemetry_ingestions_device_motor
        FOREIGN KEY (device_id, motor_id)
        REFERENCES public.devices (id, motor_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
);

COMMENT ON TABLE public.telemetry_ingestions IS
    'Registro idempotente de mensajes MQTT de telemetría procesados.';

CREATE INDEX ix_telemetry_ingestions_device_time
    ON public.telemetry_ingestions (device_id, received_at DESC);

CREATE INDEX ix_telemetry_ingestions_motor_time
    ON public.telemetry_ingestions (motor_id, received_at DESC);

CREATE UNIQUE INDEX uq_alarms_open_device_type
    ON public.alarms (device_id, alarm_type)
    WHERE device_id IS NOT NULL
      AND status IN ('ACTIVE', 'ACKNOWLEDGED');
