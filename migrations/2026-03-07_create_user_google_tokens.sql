CREATE TABLE IF NOT EXISTS public.user_google_tokens (
    user_id TEXT PRIMARY KEY,
    email TEXT,
    refresh_token TEXT NOT NULL,
    account_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.touch_user_google_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_google_tokens_updated_at ON public.user_google_tokens;

CREATE TRIGGER trg_user_google_tokens_updated_at
BEFORE UPDATE ON public.user_google_tokens
FOR EACH ROW
EXECUTE FUNCTION public.touch_user_google_tokens_updated_at();
