\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    v_client_id UUID;
    v_plant_id UUID;
    v_motor_id UUID;
    v_device_id UUID;
BEGIN
    INSERT INTO clients (
        name,
        tax_id,
        email
    )
    VALUES (
        'Cliente de Prueba SpA',
        '76.000.000-0',
        'prueba@example.com'
    )
    RETURNING id INTO v_client_id;

    INSERT INTO plants (
        client_id,
        name,
        code,
        description,
        location,
        latitude,
        longitude
    )
    VALUES (
        v_client_id,
        'Planta de Prueba',
        'PLANT-TEST-001',
        'Planta creada por la prueba de integración',
        'Antofagasta, Chile',
        -23.650900,
        -70.397500
    )
    RETURNING id INTO v_plant_id;

    INSERT INTO motors (
        plant_id,
        name,
        code,
        manufacturer,
        model,
        rated_power_kw,
        rated_voltage,
        rated_current,
        rated_frequency_hz
    )
    VALUES (
        v_plant_id,
        'Motor bomba de prueba',
        'MOTOR-TEST-001',
        'Fabricante de prueba',
        'Bomba periférica 0.5 HP',
        0.373,
        220,
        3.2,
        50
    )
    RETURNING id INTO v_motor_id;

    INSERT INTO devices (
        plant_id,
        motor_id,
        name,
        device_code,
        serial_number,
        firmware_version,
        communication_type,
        status,
        configuration
    )
    VALUES (
        v_plant_id,
        v_motor_id,
        'Prototipo ESP32',
        'DEVICE-TEST-001',
        'SERIAL-TEST-001',
        '0.1.0',
        'LTE',
        'ACTIVE',
        jsonb_build_object(
            'sampling_interval_seconds', 60,
            'adc', 'ADS1220',
            'modem', 'SIM7672G'
        )
    )
    RETURNING id INTO v_device_id;

    INSERT INTO telemetry (
        measured_at,
        device_id,
        motor_id,
        measurement_type,
        value,
        unit,
        quality,
        metadata
    )
    VALUES (
        now() - interval '5 seconds',
        v_device_id,
        v_motor_id,
        'winding_resistance',
        4.820000,
        'ohm',
        'GOOD',
        jsonb_build_object(
            'test', true,
            'source', 'schema_smoke_test'
        )
    );

    INSERT INTO alarms (
        motor_id,
        device_id,
        alarm_type,
        severity,
        message,
        measured_value,
        threshold_value,
        unit,
        started_at,
        status
    )
    VALUES (
        v_motor_id,
        v_device_id,
        'HIGH_WINDING_RESISTANCE',
        'WARNING',
        'Resistencia del bobinado sobre el umbral configurado',
        4.820000,
        4.500000,
        'ohm',
        now(),
        'ACTIVE'
    );

    RAISE NOTICE 'Smoke test completed successfully';
    RAISE NOTICE 'Client ID: %', v_client_id;
    RAISE NOTICE 'Plant ID: %', v_plant_id;
    RAISE NOTICE 'Motor ID: %', v_motor_id;
    RAISE NOTICE 'Device ID: %', v_device_id;
END;
$$;

SELECT
    c.name AS client,
    p.name AS plant,
    m.name AS motor,
    d.name AS device,
    t.measurement_type,
    t.value,
    t.unit,
    t.quality
FROM clients c
JOIN plants p
    ON p.client_id = c.id
JOIN motors m
    ON m.plant_id = p.id
JOIN devices d
    ON d.motor_id = m.id
JOIN telemetry t
    ON t.device_id = d.id
   AND t.motor_id = m.id
WHERE d.device_code = 'DEVICE-TEST-001';

SELECT
    a.alarm_type,
    a.severity,
    a.status,
    a.measured_value,
    a.threshold_value,
    a.unit
FROM alarms a
JOIN devices d
    ON d.id = a.device_id
WHERE d.device_code = 'DEVICE-TEST-001';

ROLLBACK;
