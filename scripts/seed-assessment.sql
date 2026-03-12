-- Seed data for assessment scenario (Task 1)
-- Employee: gross 60,000; 10% deductions; 15 days worked; 2 withdrawals (5000 on 5th, 2000 on 10th)

-- Ensure employee exists
INSERT INTO employees (id, gross_monthly_salary, deduction_percent)
VALUES ('user-001', 60000, 10)
ON CONFLICT (id) DO UPDATE SET
  gross_monthly_salary = EXCLUDED.gross_monthly_salary,
  deduction_percent = EXCLUDED.deduction_percent;

-- Add previous withdrawals (5th and 10th of current month)
INSERT INTO withdrawals (id, user_id, amount, idempotency_key, status, created_at)
VALUES
  (gen_random_uuid(), 'user-001', 5000, 'seed-wd-5th-user-001', 'completed', date_trunc('month', CURRENT_DATE) + INTERVAL '4 days'),
  (gen_random_uuid(), 'user-001', 2000, 'seed-wd-10th-user-001', 'completed', date_trunc('month', CURRENT_DATE) + INTERVAL '9 days')
ON CONFLICT (idempotency_key) DO NOTHING;
