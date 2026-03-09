-- Allow storing multiple Gmail connections per app user.
-- Moves from one-row-per-user to one-row-per-(user,email).

ALTER TABLE public.user_google_tokens
  DROP CONSTRAINT IF EXISTS user_google_tokens_pkey;

ALTER TABLE public.user_google_tokens
  ADD COLUMN IF NOT EXISTS id UUID;

UPDATE public.user_google_tokens
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.user_google_tokens
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.user_google_tokens
  ALTER COLUMN id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_google_tokens_pkey'
      AND conrelid = 'public.user_google_tokens'::regclass
  ) THEN
    ALTER TABLE public.user_google_tokens
      ADD CONSTRAINT user_google_tokens_pkey PRIMARY KEY (id);
  END IF;
END
$$;

ALTER TABLE public.user_google_tokens
  ADD COLUMN IF NOT EXISTS provider_sub TEXT;

UPDATE public.user_google_tokens
SET email = lower(trim(email))
WHERE email IS NOT NULL;

UPDATE public.user_google_tokens
SET email = 'unknown+' || user_id || '@gmail.local'
WHERE email IS NULL OR btrim(email) = '';

ALTER TABLE public.user_google_tokens
  ALTER COLUMN email SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_google_tokens_user_id_email_key'
      AND conrelid = 'public.user_google_tokens'::regclass
  ) THEN
    ALTER TABLE public.user_google_tokens
      ADD CONSTRAINT user_google_tokens_user_id_email_key UNIQUE (user_id, email);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_user_google_tokens_user_id
  ON public.user_google_tokens (user_id);
