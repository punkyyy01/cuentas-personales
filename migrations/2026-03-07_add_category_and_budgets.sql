-- 1. Agregar columna 'category' a transactions si no existe
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category TEXT;

-- 2. Tabla de presupuestos mensuales por categoria
CREATE TABLE IF NOT EXISTS budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    category TEXT NOT NULL,
    amount_limit NUMERIC(15,2) NOT NULL,
    month TEXT NOT NULL,  -- formato YYYY-MM
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    UNIQUE(user_id, category, month)
);

-- 3. Indice para consultas rapidas de presupuestos por usuario y mes
CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month);

-- 4. Indice para consultas de transacciones por categoria
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(user_id, category);
