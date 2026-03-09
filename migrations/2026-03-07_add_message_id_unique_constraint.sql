-- Add message_id column (if not exists) and UNIQUE constraint for Gmail idempotency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'message_id'
  ) THEN
    ALTER TABLE public.transactions ADD COLUMN message_id TEXT;
  END IF;
END $$;

-- Create unique index so upsert(onConflict: 'message_id') works correctly.
-- NULLS NOT DISTINCT is omitted so rows without message_id (manual expenses) are not constrained.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_message_id
  ON public.transactions (message_id)
  WHERE message_id IS NOT NULL;
