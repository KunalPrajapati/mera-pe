/**
 * Controller for POST /api/withdraw
 * Processes a withdrawal request with idempotency and double-spend protection (Task 2).
 */

const { process_withdrawal } = require('../services/withdrawalService');

const VALID_USER_ID = 'user-001';

async function withdraw(req, res, next) {
  try {
    const { userId, amount, idempotencyKey } = req.body;
    if (!userId || amount == null) {
      return res.status(400).json({
        status: 'error',
        message: 'userId and amount are required',
      });
    }
    if (String(userId).trim() !== VALID_USER_ID) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }
    const numAmount = Number(amount);
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'amount must be a positive number',
      });
    }
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'idempotencyKey is required (unique per logical request)',
      });
    }
    const result = await process_withdrawal(String(userId).trim(), numAmount, idempotencyKey.trim());
    if (result.success) {
      return res.status(200).json({
        status: 'ok',
        message: result.alreadyProcessed ? 'Withdrawal already processed' : 'Withdrawal processed',
        data: {
          withdrawalId: result.withdrawalId,
          amount: result.amount,
          alreadyProcessed: result.alreadyProcessed || false,
        },
      });
    }
    return res.status(422).json({
      status: 'error',
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { withdraw };
