/**
 * Controller for POST /api/withdraw
 * Processes a withdrawal request with idempotency and double-spend protection (Task 2).
 */

const { process_withdrawal } = require('../services/withdrawalService');

async function withdraw(req, res, next) {
  try {
    const { userId, amount, idempotencyKey } = req.body;
    if (!userId || amount == null) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'userId and amount are required',
      });
    }
    const numAmount = Number(amount);
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'amount must be a positive number',
      });
    }
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return res.status(400).json({
        error: 'Bad request',
        message: 'idempotencyKey is required (unique per logical request)',
      });
    }
    const result = await process_withdrawal(userId, numAmount, idempotencyKey.trim());
    if (result.success) {
      return res.status(200).json({
        success: true,
        withdrawalId: result.withdrawalId,
        amount: result.amount,
        message: result.message,
        alreadyProcessed: result.alreadyProcessed || false,
      });
    }
    return res.status(422).json({
      success: false,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { withdraw };
