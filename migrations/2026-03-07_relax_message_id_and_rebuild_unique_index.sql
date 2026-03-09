-- Emergency hardening for Gmail idempotent inserts.
-- Keep message_id nullable for legacy/manual inserts and ensure partial unique index exists.

ALTER TABLE public.transactions
  ALTER COLUMN message_id DROP NOT NULL;

-- Drop both potential index names to avoid duplicate uniqueness definitions.
DROP INDEX IF EXISTS public.idx_unique_message_id;
DROP INDEX IF EXISTS public.uq_transactions_message_id;

CREATE UNIQUE INDEX idx_unique_message_id
  ON public.transactions (message_id)
  WHERE (message_id IS NOT NULL);
