/**
 * Task 1: Earned Wage Calculator Engine
 *
 * Computes how much an employee can withdraw (Earned Wage Access).
 * Rules: up to 100% of net earned wages so far; max 3 withdrawals per month.
 */

const { pool } = require('../config/database');

/** Defaults from assessment (mock data) */
const DEFAULTS = {
  grossMonthlySalary: 60000,
  deductionPercent: 10,
  daysInCurrentMonth: 30,
  daysWorkedSoFar: 15,
};

// Get employee config from DB, or fall back to defaults (for demo/mock).
async function getEmployeeEarningsConfig(userId) {
  try {
    const res = await pool.query(
      `SELECT gross_monthly_salary AS "grossMonthlySalary",
              deduction_percent AS "deductionPercent"
       FROM employees WHERE id = $1`,
      [userId]
    );
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (res.rows.length === 0) {
      return {
        grossMonthlySalary: DEFAULTS.grossMonthlySalary,
        deductionPercent: DEFAULTS.deductionPercent,
        daysWorkedSoFar: DEFAULTS.daysWorkedSoFar,
        daysInMonth,
      };
    }
    const row = res.rows[0];
    return {
      grossMonthlySalary: Number(row.grossMonthlySalary),
      deductionPercent: Number(row.deductionPercent),
      daysWorkedSoFar: DEFAULTS.daysWorkedSoFar,
      daysInMonth,
    };
  } catch (err) {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return {
      grossMonthlySalary: DEFAULTS.grossMonthlySalary,
      deductionPercent: DEFAULTS.deductionPercent,
      daysWorkedSoFar: DEFAULTS.daysWorkedSoFar,
      daysInMonth: daysInMonth,
    };
  }
}


//  Get sum of completed withdrawals and count for current month for a user.
async function getWithdrawalsThisMonth(userId) {
  try {
    const res = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS count
       FROM withdrawals
       WHERE user_id = $1
         AND status = 'completed'
         AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)`,
      [userId]
    );
    const row = res.rows[0];
    return { total: Number(row.total), count: Number(row.count) };
  } catch (err) {
    return { total: 0, count: 0 };
  }
}

const MAX_WITHDRAWALS_PER_MONTH = 3;

/**
 * Core logic: calculate how much the user can withdraw right now.
 *
 * Formula:
 *   net_earned_so_far = (net monthly salary) * (days worked / days in month)
 *   net monthly salary = gross * (1 - deduction_percent/100)
 *   available_limit = net_earned_so_far - total_withdrawn_this_month
 *   is_eligible = (available_limit > 0) && (withdrawal_count_this_month < 3)
 */
async function calculate_available_limit(userId) {
  const config = await getEmployeeEarningsConfig(userId);
  const { grossMonthlySalary, deductionPercent, daysWorkedSoFar, daysInMonth } = config;

  const netMonthlySalary = grossMonthlySalary * (1 - deductionPercent / 100);
  const net_earned_so_far = (netMonthlySalary / daysInMonth) * daysWorkedSoFar;

  const { total: total_withdrawn_this_month, count: withdrawalCountThisMonth } =
    await getWithdrawalsThisMonth(userId);

  const available_limit = Math.max(0, net_earned_so_far - total_withdrawn_this_month);
  const is_eligible_for_withdrawal =
    available_limit > 0 && withdrawalCountThisMonth < MAX_WITHDRAWALS_PER_MONTH;

  return {
    net_earned_so_far: Math.round(net_earned_so_far * 100) / 100,
    total_withdrawn_this_month: Math.round(total_withdrawn_this_month * 100) / 100,
    available_limit: Math.round(available_limit * 100) / 100,
    is_eligible_for_withdrawal,
  };
}

module.exports = {
  calculate_available_limit,
  getEmployeeEarningsConfig,
  getWithdrawalsThisMonth,
  MAX_WITHDRAWALS_PER_MONTH,
};
