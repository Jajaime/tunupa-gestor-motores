BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- =========================================================
-- UPDATED_AT FUNCTION
-- =========================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- =========================================================
-- CLIENTS
-- =========================================================

CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    tax_id VARCHAR(30),
    email VARCHAR(255),
    phone VARCHAR(30),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_clients_tax_id
        UNIQUE (tax_id),

    CONSTRAINT uq_clients_email
        UNIQUE (email),

    CONSTRAINT ck_clients_name_not_empty
        CHECK (length(trim(name)) > 0),

    CONSTRAINT ck_clients_status
        CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE TRIGGER trg_clients_set_updated_at
BEFORE UPDATE ON clients
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- =========================================================
-- PLANTS
-- =========================================================

CREATE TABLE plants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL,
    description TEXT,
    location VARCHAR(255),
    latitude NUMERIC(9, 6),
    longitude NUMERIC(10, 6),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_plants_client
        FOREIGN KEY (client_id)
        REFERENCES clients(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    CONSTRAINT uq_plants_client_code
        UNIQUE (client_id, code),

    CONSTRAINT ck_plants_name_not_empty
        CHECK (length(trim(name)) > 0),

    CONSTRAINT ck_plants_code_not_empty
        CHECK (length(trim(code)) > 0),

    CONSTRAINT ck_plants_latitude
        CHECK (
            latitude IS NULL
            OR latitude BETWEEN -90 AND 90
        ),

    CONSTRAINT ck_plants_longitude
        CHECK (
            longitude IS NULL
            OR longitude BETWEEN -180 AND 180
        ),

    CONSTRAINT ck_plants_status
        CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE INDEX ix_plants_client_id
    ON plants(client_id);

CREATE TRIGGER trg_plants_set_updated_at
BEFORE UPDATE ON plants
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- =========================================================
-- MOTORS
-- =========================================================

CREATE TABLE motors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plant_id UUID NOT NULL,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL,
    manufacturer VARCHAR(100),
    model VARCHAR(100),
    serial_number VARCHAR(100),
    rated_power_kw NUMERIC(12, 3),
    rated_voltage NUMERIC(12, 3),
    rated_current NUMERIC(12, 3),
    rated_frequency_hz NUMERIC(8, 3),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_motors_plant
        FOREIGN KEY (plant_id)
        REFERENCES plants(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    CONSTRAINT uq_motors_plant_code
        UNIQUE (plant_id, code),

    CONSTRAINT uq_motors_id_plant
        UNIQUE (id, plant_id),

    CONSTRAINT ck_motors_name_not_empty
        CHECK (length(trim(name)) > 0),

    CONSTRAINT ck_motors_code_not_empty
        CHECK (length(trim(code)) > 0),

    CONSTRAINT ck_motors_rated_power
        CHECK (
            rated_power_kw IS NULL
            OR rated_power_kw > 0
        ),

    CONSTRAINT ck_motors_rated_voltage
        CHECK (
            rated_voltage IS NULL
            OR rated_voltage > 0
        ),

    CONSTRAINT ck_motors_rated_current
        CHECK (
            rated_current IS NULL
            OR rated_current > 0
        ),

    CONSTRAINT ck_motors_rated_frequency
        CHECK (
            rated_frequency_hz IS NULL
            OR rated_frequency_hz > 0
        ),

    CONSTRAINT ck_motors_status
        CHECK (
            status IN (
                'ACTIVE',
                'INACTIVE',
                'MAINTENANCE',
                'OUT_OF_SERVICE'
            )
        )
);

CREATE INDEX ix_motors_plant_id
    ON motors(plant_id);

CREATE TRIGGER trg_motors_set_updated_at
BEFORE UPDATE ON motors
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- =========================================================
-- DEVICES
-- =========================================================

CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plant_id UUID NOT NULL,
    motor_id UUID,
    name VARCHAR(150) NOT NULL,
    device_code VARCHAR(80) NOT NULL,
    serial_number VARCHAR(100),
    firmware_version VARCHAR(50),
    communication_type VARCHAR(20) NOT NULL,
    last_connection_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'REGISTERED',
    configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_devices_plant
        FOREIGN KEY (plant_id)
        REFERENCES plants(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    CONSTRAINT fk_devices_motor_plant
        FOREIGN KEY (motor_id, plant_id)
        REFERENCES motors(id, plant_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    CONSTRAINT uq_devices_device_code
        UNIQUE (device_code),

    CONSTRAINT uq_devices_serial_number
        UNIQUE (serial_number),

    CONSTRAINT uq_devices_id_motor
        UNIQUE (id, motor_id),

    CONSTRAINT ck_devices_name_not_empty
        CHECK (length(trim(name)) > 0),

    CONSTRAINT ck_devices_code_not_empty
        CHECK (length(trim(device_code)) > 0),

    CONSTRAINT ck_devices_communication_type
        CHECK (
            communication_type IN (
                'LTE',
                'WIFI',
                'LORAWAN'
            )
        ),

    CONSTRAINT ck_devices_status
        CHECK (
            status IN (
                'REGISTERED',
                'ACTIVE',
                'INACTIVE',
                'MAINTENANCE'
            )
        ),

    CONSTRAINT ck_devices_configuration_object
        CHECK (jsonb_typeof(configuration) = 'object')
);

CREATE INDEX ix_devices_plant_id
    ON devices(plant_id);

CREATE INDEX ix_devices_motor_id
    ON devices(motor_id)
    WHERE motor_id IS NOT NULL;

CREATE INDEX ix_devices_last_connection
    ON devices(last_connection_at DESC);

CREATE TRIGGER trg_devices_set_updated_at
BEFORE UPDATE ON devices
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- =========================================================
-- TELEMETRY
-- =========================================================

CREATE TABLE telemetry (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    measured_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    device_id UUID NOT NULL,
    motor_id UUID NOT NULL,
    measurement_type VARCHAR(50) NOT NULL,
    value NUMERIC(18, 6) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    quality VARCHAR(20) NOT NULL DEFAULT 'GOOD',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT pk_telemetry
        PRIMARY KEY (id, measured_at),

    CONSTRAINT fk_telemetry_device_motor
        FOREIGN KEY (device_id, motor_id)
        REFERENCES devices(id, motor_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    CONSTRAINT ck_telemetry_measurement_type_not_empty
        CHECK (length(trim(measurement_type)) > 0),

    CONSTRAINT ck_telemetry_unit_not_empty
        CHECK (length(trim(unit)) > 0),

    CONSTRAINT ck_telemetry_quality
        CHECK (
            quality IN (
                'GOOD',
                'UNCERTAIN',
                'BAD'
            )
        ),

    CONSTRAINT ck_telemetry_metadata_object
        CHECK (jsonb_typeof(metadata) = 'object')
);

-- Convert the PostgreSQL table into a TimescaleDB hypertable.
SELECT create_hypertable(
    'telemetry',
    by_range('measured_at'),
    if_not_exists => TRUE
);

CREATE INDEX ix_telemetry_device_time
    ON telemetry(device_id, measured_at DESC);

CREATE INDEX ix_telemetry_motor_time
    ON telemetry(motor_id, measured_at DESC);

CREATE INDEX ix_telemetry_motor_type_time
    ON telemetry(
        motor_id,
        measurement_type,
        measured_at DESC
    );

-- =========================================================
-- ALARMS
-- =========================================================

CREATE TABLE alarms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    motor_id UUID NOT NULL,
    device_id UUID,
    alarm_type VARCHAR(80) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    measured_value NUMERIC(18, 6),
    threshold_value NUMERIC(18, 6),
    unit VARCHAR(20),
    started_at TIMESTAMPTZ NOT NULL,
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_alarms_motor
        FOREIGN KEY (motor_id)
        REFERENCES motors(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    CONSTRAINT fk_alarms_device_motor
        FOREIGN KEY (device_id, motor_id)
        REFERENCES devices(id, motor_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    CONSTRAINT ck_alarms_type_not_empty
        CHECK (length(trim(alarm_type)) > 0),

    CONSTRAINT ck_alarms_message_not_empty
        CHECK (length(trim(message)) > 0),

    CONSTRAINT ck_alarms_severity
        CHECK (
            severity IN (
                'INFO',
                'WARNING',
                'CRITICAL'
            )
        ),

    CONSTRAINT ck_alarms_status
        CHECK (
            status IN (
                'ACTIVE',
                'ACKNOWLEDGED',
                'RESOLVED'
            )
        ),

    CONSTRAINT ck_alarms_acknowledged_at
        CHECK (
            acknowledged_at IS NULL
            OR acknowledged_at >= started_at
        ),

    CONSTRAINT ck_alarms_resolved_at
        CHECK (
            resolved_at IS NULL
            OR resolved_at >= started_at
        ),

    CONSTRAINT ck_alarms_status_dates
        CHECK (
            status <> 'RESOLVED'
            OR resolved_at IS NOT NULL
        )
);

CREATE INDEX ix_alarms_motor_time
    ON alarms(motor_id, started_at DESC);

CREATE INDEX ix_alarms_device_time
    ON alarms(device_id, started_at DESC)
    WHERE device_id IS NOT NULL;

CREATE INDEX ix_alarms_open
    ON alarms(severity, started_at DESC)
    WHERE status IN ('ACTIVE', 'ACKNOWLEDGED');

CREATE TRIGGER trg_alarms_set_updated_at
BEFORE UPDATE ON alarms
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
