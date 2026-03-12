/**
 * Task 2: Withdrawal processing with double-spend protection
 *
 * Uses:
 * 1. Idempotency keys - same key => same result, duplicate requests get 409 or return existing
 * 2. Row-level locking (SELECT ... FOR UPDATE) on the user's "context" so concurrent
 *    requests serialize and only one can succeed for the same balance.
 */

const { pool } = require('../config/database');
const { calculate_available_limit } = require('./earnedWageCalculator');
const { randomUUID } = require('crypto');

/** Withdrawal status */
const STATUS = { PENDING: 'pending', COMPLETED: 'completed', FAILED: 'failed' };

/**
 * Process a withdrawal request. Safe under concurrent duplicate requests (idempotency + locking).
 *
 * Flow:
 * 1. Check idempotency: if we already processed this key, return that result.
 * 2. Start DB transaction.
 * 3. Lock the employee row (or a "ledger" row per user) with FOR UPDATE so other
 *    concurrent requests wait.
 * 4. Recompute available limit inside transaction (so we see latest withdrawals).
 * 5. If amount > available or not eligible, rollback and return failure.
 * 6. Insert withdrawal row with status 'completed' (and idempotency_key).
 * 7. Commit.
 * So only one of the 5 duplicate requests can commit a new row; others either see
 * idempotency hit or insufficient limit.
 */
async function process_withdrawal(userId, amount, idempotencyKey) {
  if (!userId || amount == null || amount <= 0) {
    return { success: false, message: 'Invalid userId or amount' };
  }
  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.length > 64) {
    return { success: false, message: 'Valid idempotency key required' };
  }

  const client = await pool.connect();

  try {
    // --- Idempotency: already processed? Return existing result ---
    const existing = await client.query(
      `SELECT id, amount, status FROM withdrawals WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return {
        success: row.status === STATUS.COMPLETED,
        withdrawalId: row.id,
        amount: Number(row.amount),
        message: row.status === STATUS.COMPLETED ? 'Withdrawal already completed' : 'Previous request failed',
        alreadyProcessed: true,
      };
    }

    await client.query('BEGIN');

    const lockResult = await client.query(
      `SELECT id FROM employees WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    if (lockResult.rows.length === 0) {
      await client.query('INSERT INTO employees (id, gross_monthly_salary, deduction_percent) VALUES ($1, 60000, 10) ON CONFLICT (id) DO NOTHING', [userId]);
      await client.query(`SELECT id FROM employees WHERE id = $1 FOR UPDATE`, [userId]);
    }

    const limitPayload = await calculate_available_limit_withClient(client, userId);
    if (!limitPayload.is_eligible_for_withdrawal) {
      await client.query('ROLLBACK');
      return {
        success: false,
        message: limitPayload.total_withdrawn_this_month >= limitPayload.net_earned_so_far
          ? 'No remaining balance to withdraw'
          : 'Withdrawal limit reached (3 per month)',
      };
    }
    if (amount > limitPayload.available_limit) {
      await client.query('ROLLBACK');
      return {
        success: false,
        message: `Amount exceeds available limit (${limitPayload.available_limit})`,
      };
    }

    const withdrawalId = randomUUID();
    await client.query(
      `INSERT INTO withdrawals (id, user_id, amount, idempotency_key, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [withdrawalId, userId, amount, idempotencyKey, STATUS.COMPLETED]
    );

    await client.query('COMMIT');

    return {
      success: true,
      withdrawalId,
      amount,
      message: 'Withdrawal processed',
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Same as calculate_available_limit but using an existing DB client (for use inside transaction).
 * Uses the same logic as earnedWageCalculator but runs queries on `client` instead of pool.
 */
async function calculate_available_limit_withClient(client, userId) {
  const configRes = await client.query(
    `SELECT gross_monthly_salary AS "grossMonthlySalary",
            deduction_percent AS "deductionPercent"
     FROM employees WHERE id = $1`,
    [userId]
  );
  const grossMonthlySalary = configRes.rows[0]?.grossMonthlySalary ?? 60000;
  const deductionPercent = configRes.rows[0]?.deductionPercent ?? 10;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysWorkedSoFar = 15;

  const netMonthlySalary = grossMonthlySalary * (1 - deductionPercent / 100);
  const net_earned_so_far = (netMonthlySalary / daysInMonth) * daysWorkedSoFar;

  const sumRes = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS count
     FROM withdrawals
     WHERE user_id = $1 AND status = 'completed'
       AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)`,
    [userId]
  );
  const total_withdrawn_this_month = Number(sumRes.rows[0].total);
  const withdrawalCountThisMonth = Number(sumRes.rows[0].count);
  const available_limit = Math.max(0, net_earned_so_far - total_withdrawn_this_month);
  const is_eligible_for_withdrawal = available_limit > 0 && withdrawalCountThisMonth < 3;

  return {
    net_earned_so_far,
    total_withdrawn_this_month,
    available_limit,
    is_eligible_for_withdrawal,
  };
}

module.exports = {
  process_withdrawal,
  STATUS,
};
