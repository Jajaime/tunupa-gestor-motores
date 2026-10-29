BEGIN;

-- Relación explícita usuario-empresa. Sin asignación no se puede consultar telemetría.
CREATE TABLE public.user_client_access (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, client_id)
);
CREATE INDEX ix_user_client_access_client ON public.user_client_access(client_id, user_id);

COMMIT;
