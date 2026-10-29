BEGIN;
DROP TRIGGER IF EXISTS trg_alarm_event_audit ON public.alarms;
DROP FUNCTION IF EXISTS public.capture_alarm_event();
DROP TABLE IF EXISTS public.alarm_events;
COMMIT;
