\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    v_client_id UUID;
    v_plant_id UUID;
    v_motor_a_id UUID;
    v_motor_b_id UUID;
    v_device_id UUID;
BEGIN
    INSERT INTO clients (name)
    VALUES ('Cliente validación FK')
    RETURNING id INTO v_client_id;

    INSERT INTO plants (
        client_id,
        name,
        code
    )
    VALUES (
        v_client_id,
        'Planta validación FK',
        'PLANT-FK-TEST'
    )
    RETURNING id INTO v_plant_id;

    INSERT INTO motors (
        plant_id,
        name,
        code
    )
    VALUES (
        v_plant_id,
        'Motor A',
        'MOTOR-A'
    )
    RETURNING id INTO v_motor_a_id;

    INSERT INTO motors (
        plant_id,
        name,
        code
    )
    VALUES (
        v_plant_id,
        'Motor B',
        'MOTOR-B'
    )
    RETURNING id INTO v_motor_b_id;

    INSERT INTO devices (
        plant_id,
        motor_id,
        name,
        device_code,
        communication_type
    )
    VALUES (
        v_plant_id,
        v_motor_a_id,
        'Dispositivo del Motor A',
        'DEVICE-FK-TEST',
        'LTE'
    )
    RETURNING id INTO v_device_id;

    BEGIN
        INSERT INTO telemetry (
            measured_at,
            device_id,
            motor_id,
            measurement_type,
            value,
            unit
        )
        VALUES (
            now(),
            v_device_id,
            v_motor_b_id,
            'voltage',
            220,
            'V'
        );

        RAISE EXCEPTION
            'ERROR: la relación incorrecta fue aceptada';

    EXCEPTION
        WHEN foreign_key_violation THEN
            RAISE NOTICE
                'Expected foreign key violation detected successfully';
    END;
END;
$$;

ROLLBACK;
