-- Extend source enum to include 'fintoc'
ALTER TYPE transaction_source_type ADD VALUE IF NOT EXISTS 'fintoc';

-- Table to store Fintoc link tokens per user
CREATE TABLE IF NOT EXISTS fintoc_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    link_token TEXT NOT NULL,
    institution_name TEXT,
    created_at TIMESTAMP DEFAULT now(),
    UNIQUE(user_id, link_token)
);

CREATE INDEX IF NOT EXISTS idx_fintoc_links_user ON fintoc_links(user_id);

-- Composite index for Fintoc deduplication: find existing transactions by amount + date + description
CREATE INDEX IF NOT EXISTS idx_transactions_dedup_fintoc
  ON public.transactions (user_id, amount, description, transaction_date)
  WHERE source != 'fintoc';
