BEGIN;

CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(254) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'VIEWER',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_users_email_lowercase CHECK (email = lower(email)),
    CONSTRAINT ck_users_display_name_not_empty CHECK (length(trim(display_name)) > 0),
    CONSTRAINT ck_users_role CHECK (role IN ('ADMIN', 'OPERATOR', 'VIEWER')),
    CONSTRAINT ck_users_status CHECK (status IN ('ACTIVE', 'LOCKED', 'DISABLED')),
    CONSTRAINT ck_users_failed_attempts CHECK (failed_login_attempts >= 0)
);

CREATE UNIQUE INDEX uq_users_email ON public.users (lower(email));

CREATE TABLE public.auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    ip_address VARCHAR(64),
    user_agent VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_auth_sessions_token_hash CHECK (token_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX ix_auth_sessions_user ON public.auth_sessions(user_id);
CREATE INDEX ix_auth_sessions_expiry ON public.auth_sessions(expires_at)
    WHERE revoked_at IS NULL;

CREATE TABLE public.auth_events (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    email VARCHAR(254),
    event_type VARCHAR(40) NOT NULL,
    success BOOLEAN NOT NULL,
    ip_address VARCHAR(64),
    user_agent VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_auth_events_created_at ON public.auth_events(created_at DESC);
CREATE INDEX ix_auth_events_user ON public.auth_events(user_id, created_at DESC);

CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
