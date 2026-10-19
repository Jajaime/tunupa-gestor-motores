\echo '=== Dispositivo, motor y corriente de referencia ==='
SELECT d.device_code, d.status AS device_status,
       d.last_telemetry_received_at, m.code AS motor_code,
       m.operational_status, m.last_telemetry_at,
       COALESCE(m.rated_current, 3) AS corriente_nominal_para_simulador
FROM public.devices AS d
JOIN public.motors AS m ON m.id = d.motor_id
WHERE d.device_code = :'device_code';

\echo '=== Ultimas mediciones por variable ==='
SELECT DISTINCT ON (t.measurement_type)
       t.measurement_type, t.value, t.unit, t.quality,
       t.measured_at, t.received_at, t.metadata ->> 'scenario' AS scenario
FROM public.telemetry AS t
JOIN public.devices AS d ON d.id = t.device_id
WHERE d.device_code = :'device_code'
ORDER BY t.measurement_type, t.measured_at DESC, t.received_at DESC;

\echo '=== Ultimas alarmas del dispositivo (activas y resueltas) ==='
SELECT a.alarm_type, a.severity, a.status, a.measured_value,
       a.threshold_value, a.unit, a.started_at, a.resolved_at
FROM public.alarms AS a
JOIN public.devices AS d ON d.id = a.device_id
WHERE d.device_code = :'device_code'
ORDER BY a.started_at DESC
LIMIT 10;

\echo '=== Totales del dispositivo para comparar antes y despues ==='
SELECT d.device_code,
       (SELECT count(*) FROM public.telemetry_ingestions AS i
        WHERE i.device_id = d.id) AS mensajes_procesados,
       (SELECT count(*) FROM public.telemetry AS t
        WHERE t.device_id = d.id) AS mediciones_guardadas
FROM public.devices AS d
WHERE d.device_code = :'device_code';
