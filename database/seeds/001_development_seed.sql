\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- Cliente
-- ---------------------------------------------------------------------------

INSERT INTO public.clients (
    id,
    name,
    tax_id,
    email,
    phone,
    status
)
VALUES (
    '10000000-0000-4000-8000-000000000001',
    'Tunupa Demo',
    'DEMO-CLIENT-001',
    'demo@tunupa.local',
    '+56 9 0000 0000',
    'ACTIVE'
)
ON CONFLICT (id) DO UPDATE
SET
    name = EXCLUDED.name,
    tax_id = EXCLUDED.tax_id,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    status = EXCLUDED.status;

-- ---------------------------------------------------------------------------
-- Planta
-- ---------------------------------------------------------------------------

INSERT INTO public.plants (
    id,
    client_id,
    name,
    code,
    description,
    location,
    latitude,
    longitude,
    status
)
VALUES (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Planta Piloto Antofagasta',
    'PLANTA-DEMO-001',
    'Planta controlada para desarrollo y pruebas del gestor de motores.',
    'Antofagasta, Chile',
    -23.650927,
    -70.397502,
    'ACTIVE'
)
ON CONFLICT (id) DO UPDATE
SET
    client_id = EXCLUDED.client_id,
    name = EXCLUDED.name,
    code = EXCLUDED.code,
    description = EXCLUDED.description,
    location = EXCLUDED.location,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    status = EXCLUDED.status;

-- ---------------------------------------------------------------------------
-- Motores
-- ---------------------------------------------------------------------------

INSERT INTO public.motors (
    id,
    plant_id,
    name,
    code,
    manufacturer,
    model,
    serial_number,
    rated_power_kw,
    rated_voltage,
    rated_current,
    rated_frequency_hz,
    status
)
VALUES
(
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Bomba centrífuga de prueba',
    'MOTOR-DEMO-001',
    'Qatar Shop',
    'Bomba periférica 0.5 HP',
    'DEMO-MOTOR-SN-001',
    0.373,
    220.000,
    2.500,
    50.000,
    'ACTIVE'
),
(
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'Motor auxiliar de prueba',
    'MOTOR-DEMO-002',
    'WEG',
    'W22',
    'DEMO-MOTOR-SN-002',
    1.500,
    380.000,
    3.400,
    50.000,
    'MAINTENANCE'
)
ON CONFLICT (id) DO UPDATE
SET
    plant_id = EXCLUDED.plant_id,
    name = EXCLUDED.name,
    code = EXCLUDED.code,
    manufacturer = EXCLUDED.manufacturer,
    model = EXCLUDED.model,
    serial_number = EXCLUDED.serial_number,
    rated_power_kw = EXCLUDED.rated_power_kw,
    rated_voltage = EXCLUDED.rated_voltage,
    rated_current = EXCLUDED.rated_current,
    rated_frequency_hz = EXCLUDED.rated_frequency_hz,
    status = EXCLUDED.status;

-- ---------------------------------------------------------------------------
-- Dispositivos
-- ---------------------------------------------------------------------------

INSERT INTO public.devices (
    id,
    plant_id,
    motor_id,
    name,
    device_code,
    serial_number,
    firmware_version,
    communication_type,
    last_connection_at,
    status,
    configuration
)
VALUES
(
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'Monitor ESP32 bomba principal',
    'ESP32-DEMO-001',
    'DEMO-ESP32-SN-001',
    '0.1.0',
    'LTE',
    NOW() - INTERVAL '10 seconds',
    'ACTIVE',
    '{
      "source": "development_seed",
      "board": "ESP-WROOM-32",
      "modem": "SIM7672G",
      "protocol": "MQTT",
      "samplingSeconds": 10
    }'::jsonb
),
(
    '40000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    'Monitor auxiliar WiFi',
    'ESP32-DEMO-002',
    'DEMO-ESP32-SN-002',
    '0.1.0',
    'WIFI',
    NOW() - INTERVAL '5 minutes',
    'MAINTENANCE',
    '{
      "source": "development_seed",
      "board": "ESP-WROOM-32",
      "protocol": "MQTT",
      "samplingSeconds": 30
    }'::jsonb
)
ON CONFLICT (id) DO UPDATE
SET
    plant_id = EXCLUDED.plant_id,
    motor_id = EXCLUDED.motor_id,
    name = EXCLUDED.name,
    device_code = EXCLUDED.device_code,
    serial_number = EXCLUDED.serial_number,
    firmware_version = EXCLUDED.firmware_version,
    communication_type = EXCLUDED.communication_type,
    last_connection_at = EXCLUDED.last_connection_at,
    status = EXCLUDED.status,
    configuration = EXCLUDED.configuration;

-- ---------------------------------------------------------------------------
-- Tabla inicial de dispositivos de medición
-- ---------------------------------------------------------------------------

INSERT INTO public.measurement_devices (
    device_code,
    device_name,
    description,
    status,
    installed_at
)
VALUES (
    'ESP32-SEED-001',
    'ESP32 de desarrollo',
    'Registro controlado para validar la tabla measurement_devices.',
    'active',
    NOW() - INTERVAL '1 day'
)
ON CONFLICT (device_code) DO UPDATE
SET
    device_name = EXCLUDED.device_name,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    installed_at = EXCLUDED.installed_at,
    updated_at = CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------------
-- Telemetría
-- Se elimina solamente la telemetría identificada como semilla.
-- ---------------------------------------------------------------------------

DELETE FROM public.telemetry
WHERE metadata ->> 'source' = 'development_seed';

INSERT INTO public.telemetry (
    id,
    measured_at,
    device_id,
    motor_id,
    measurement_type,
    value,
    unit,
    quality,
    metadata
)
VALUES
(
    '50000000-0000-4000-8000-000000000001',
    NOW() - INTERVAL '60 seconds',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'voltage',
    220.300000,
    'V',
    'GOOD',
    '{"source":"development_seed","sensor":"voltage"}'::jsonb
),
(
    '50000000-0000-4000-8000-000000000002',
    NOW() - INTERVAL '50 seconds',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'current',
    2.100000,
    'A',
    'GOOD',
    '{"source":"development_seed","sensor":"current"}'::jsonb
),
(
    '50000000-0000-4000-8000-000000000003',
    NOW() - INTERVAL '40 seconds',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'active_power',
    0.360000,
    'kW',
    'GOOD',
    '{"source":"development_seed","sensor":"power"}'::jsonb
),
(
    '50000000-0000-4000-8000-000000000004',
    NOW() - INTERVAL '30 seconds',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'insulation_resistance',
    125.000000,
    'MOhm',
    'GOOD',
    '{"source":"development_seed","sensor":"SKIM400"}'::jsonb
),
(
    '50000000-0000-4000-8000-000000000005',
    NOW() - INTERVAL '20 seconds',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'temperature',
    44.800000,
    'C',
    'GOOD',
    '{"source":"development_seed","sensor":"temperature"}'::jsonb
),
(
    '50000000-0000-4000-8000-000000000006',
    NOW() - INTERVAL '10 seconds',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'vibration',
    1.200000,
    'mm/s',
    'GOOD',
    '{"source":"development_seed","sensor":"vibration"}'::jsonb
),
(
    '50000000-0000-4000-8000-000000000007',
    NOW() - INTERVAL '5 minutes',
    '40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    'voltage',
    379.400000,
    'V',
    'GOOD',
    '{"source":"development_seed","sensor":"voltage"}'::jsonb
),
(
    '50000000-0000-4000-8000-000000000008',
    NOW() - INTERVAL '4 minutes',
    '40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    'current',
    3.100000,
    'A',
    'GOOD',
    '{"source":"development_seed","sensor":"current"}'::jsonb
),
(
    '50000000-0000-4000-8000-000000000009',
    NOW() - INTERVAL '3 minutes',
    '40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    'active_power',
    1.420000,
    'kW',
    'GOOD',
    '{"source":"development_seed","sensor":"power"}'::jsonb
),
(
    '50000000-0000-4000-8000-000000000010',
    NOW() - INTERVAL '2 minutes',
    '40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    'temperature',
    68.500000,
    'C',
    'UNCERTAIN',
    '{"source":"development_seed","sensor":"temperature"}'::jsonb
),
(
    '50000000-0000-4000-8000-000000000011',
    NOW() - INTERVAL '90 seconds',
    '40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    'vibration',
    4.800000,
    'mm/s',
    'UNCERTAIN',
    '{"source":"development_seed","sensor":"vibration"}'::jsonb
),
(
    '50000000-0000-4000-8000-000000000012',
    NOW() - INTERVAL '30 seconds',
    '40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    'insulation_resistance',
    48.000000,
    'MOhm',
    'UNCERTAIN',
    '{"source":"development_seed","sensor":"SKIM400"}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Alarmas
-- ---------------------------------------------------------------------------

INSERT INTO public.alarms (
    id,
    motor_id,
    device_id,
    alarm_type,
    severity,
    message,
    measured_value,
    threshold_value,
    unit,
    started_at,
    acknowledged_at,
    resolved_at,
    status
)
VALUES
(
    '60000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'LOW_INSULATION',
    'CRITICAL',
    'La resistencia de aislamiento se encuentra bajo el umbral configurado.',
    20.000000,
    50.000000,
    'MOhm',
    NOW() - INTERVAL '5 minutes',
    NULL,
    NULL,
    'ACTIVE'
),
(
    '60000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002',
    'HIGH_TEMPERATURE',
    'WARNING',
    'La temperatura superó temporalmente el umbral configurado.',
    72.000000,
    65.000000,
    'C',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '23 hours 55 minutes',
    NOW() - INTERVAL '23 hours 30 minutes',
    'RESOLVED'
)
ON CONFLICT (id) DO UPDATE
SET
    motor_id = EXCLUDED.motor_id,
    device_id = EXCLUDED.device_id,
    alarm_type = EXCLUDED.alarm_type,
    severity = EXCLUDED.severity,
    message = EXCLUDED.message,
    measured_value = EXCLUDED.measured_value,
    threshold_value = EXCLUDED.threshold_value,
    unit = EXCLUDED.unit,
    started_at = EXCLUDED.started_at,
    acknowledged_at = EXCLUDED.acknowledged_at,
    resolved_at = EXCLUDED.resolved_at,
    status = EXCLUDED.status;

COMMIT;

SELECT 'clients' AS table_name, COUNT(*) AS seed_rows
FROM public.clients
WHERE id = '10000000-0000-4000-8000-000000000001'

UNION ALL

SELECT 'plants', COUNT(*)
FROM public.plants
WHERE id = '20000000-0000-4000-8000-000000000001'

UNION ALL

SELECT 'motors', COUNT(*)
FROM public.motors
WHERE id IN (
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002'
)

UNION ALL

SELECT 'devices', COUNT(*)
FROM public.devices
WHERE id IN (
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002'
)

UNION ALL

SELECT 'telemetry', COUNT(*)
FROM public.telemetry
WHERE metadata ->> 'source' = 'development_seed'

UNION ALL

SELECT 'alarms', COUNT(*)
FROM public.alarms
WHERE id IN (
    '60000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000002'
)

UNION ALL

SELECT 'measurement_devices', COUNT(*)
FROM public.measurement_devices
WHERE device_code = 'ESP32-SEED-001'

ORDER BY table_name;