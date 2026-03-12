-- Mera-Pe Backend: PostgreSQL schema
-- Run this once to create tables (e.g. psql -f scripts/init-db.sql)

-- Employee salary/earnings config (mock data lives here or in app; this stores per-user overrides if needed)
CREATE TABLE IF NOT EXISTS employees (
  id VARCHAR(36) PRIMARY KEY,
  gross_monthly_salary DECIMAL(12, 2) NOT NULL DEFAULT 60000,
  deduction_percent DECIMAL(5, 2) NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Withdrawals ledger: every withdrawal is a row (supports 3/month limit and sum)
CREATE TABLE IF NOT EXISTS withdrawals (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES employees(id),
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  idempotency_key VARCHAR(64) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | completed | failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(idempotency_key)
);

-- Index for "withdrawals this month" and row-level locking by user
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_created ON withdrawals(user_id, created_at);

-- Optional: balance/limit cache per user (can be derived; useful for quick checks)
CREATE TABLE IF NOT EXISTS user_limits_cache (
  user_id VARCHAR(36) PRIMARY KEY REFERENCES employees(id),
  available_limit DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_withdrawn_this_month DECIMAL(12, 2) NOT NULL DEFAULT 0,
  withdrawal_count_this_month INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
