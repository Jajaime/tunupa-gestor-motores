BEGIN;

-- Historial durable de cambios de estado/severidad de alarmas.
CREATE TABLE public.alarm_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    alarm_id UUID NOT NULL REFERENCES public.alarms(id) ON DELETE CASCADE,
    motor_id UUID NOT NULL REFERENCES public.motors(id) ON DELETE RESTRICT,
    actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    event_type VARCHAR(20) NOT NULL,
    previous_status VARCHAR(20),
    current_status VARCHAR(20) NOT NULL,
    previous_severity VARCHAR(20),
    current_severity VARCHAR(20) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_alarm_events_type CHECK (
      event_type IN ('CREATED', 'UPDATED', 'ACKNOWLEDGED', 'RESOLVED')
    )
);

CREATE INDEX ix_alarm_events_alarm_time
  ON public.alarm_events(alarm_id, occurred_at DESC, id DESC);
CREATE INDEX ix_alarm_events_motor_time
  ON public.alarm_events(motor_id, occurred_at DESC);

-- Preexistentes: reconstruir hitos conocidos sin inventar quién los ejecutó.
INSERT INTO public.alarm_events
  (alarm_id, motor_id, event_type, current_status, current_severity, occurred_at)
SELECT id, motor_id, 'CREATED', 'ACTIVE', severity, started_at
FROM public.alarms;

INSERT INTO public.alarm_events
  (alarm_id, motor_id, event_type, previous_status, current_status,
   current_severity, occurred_at)
SELECT id, motor_id, 'ACKNOWLEDGED', 'ACTIVE', 'ACKNOWLEDGED',
  severity, acknowledged_at
FROM public.alarms WHERE acknowledged_at IS NOT NULL;

INSERT INTO public.alarm_events
  (alarm_id, motor_id, event_type, previous_status, current_status,
   current_severity, occurred_at)
SELECT id, motor_id, 'RESOLVED',
  CASE WHEN acknowledged_at IS NULL THEN 'ACTIVE' ELSE 'ACKNOWLEDGED' END,
  'RESOLVED', severity, resolved_at
FROM public.alarms WHERE resolved_at IS NOT NULL;

CREATE FUNCTION public.capture_alarm_event()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    actor_uuid UUID;
    action_type VARCHAR(20);
BEGIN
    actor_uuid := NULLIF(current_setting('tunupa.actor_user_id', TRUE), '')::uuid;
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.alarm_events
          (alarm_id, motor_id, actor_user_id, event_type,
           current_status, current_severity, occurred_at)
        VALUES (NEW.id, NEW.motor_id, actor_uuid, 'CREATED',
                NEW.status, NEW.severity, NEW.started_at);
        RETURN NEW;
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status
       OR OLD.severity IS DISTINCT FROM NEW.severity THEN
        action_type := CASE
          WHEN NEW.status = 'RESOLVED' THEN 'RESOLVED'
          WHEN NEW.status = 'ACKNOWLEDGED' AND OLD.status <> 'ACKNOWLEDGED'
            THEN 'ACKNOWLEDGED'
          ELSE 'UPDATED'
        END;
        INSERT INTO public.alarm_events
          (alarm_id, motor_id, actor_user_id, event_type,
           previous_status, current_status,
           previous_severity, current_severity)
        VALUES (NEW.id, NEW.motor_id, actor_uuid, action_type,
                OLD.status, NEW.status, OLD.severity, NEW.severity);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_alarm_event_audit
AFTER INSERT OR UPDATE ON public.alarms
FOR EACH ROW EXECUTE FUNCTION public.capture_alarm_event();

COMMIT;
