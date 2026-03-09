-- Enums para restringir valores y asegurar integridad

CREATE TYPE transaction_source_type AS ENUM ('manual', 'webhook_banco');

CREATE TYPE account_type AS ENUM ('cash', 'credit_card', 'debit_card', 'savings', 'investment');

CREATE TYPE movement_type AS ENUM ('income', 'expense', 'transfer');

-- Tablas del Sistema

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE accounts_cards (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    name VARCHAR(50) NOT NULL,
    type account_type NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    current_balance NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    icon VARCHAR(50),
    color_hex VARCHAR(7)
);

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES users(id) NOT NULL,
    account_id INTEGER REFERENCES accounts_cards(id) NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    amount NUMERIC(15,2) NOT NULL,
    type movement_type NOT NULL,
    description TEXT NOT NULL,
    transaction_date TIMESTAMP NOT NULL DEFAULT now(),
    source transaction_source_type NOT NULL DEFAULT 'manual',
    bank_reference JSONB,
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT transactions_note CHECK (description IS NOT NULL)
);

-- Relaciones Adicionales
-- Un usuario puede tener muchas cuentas (1:N)
-- Un usuario puede realizar muchas transacciones (1:N)
-- Una categoría puede estar en muchas transacciones (1:N)