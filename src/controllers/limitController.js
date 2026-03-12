/**
 * Controller for GET /api/limit/:userId
 * Returns the available withdrawal limit for the user (Task 1).
 */

const { calculate_available_limit } = require('../services/earnedWageCalculator');

async function getLimit(req, res, next) {
  try {
    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    const payload = await calculate_available_limit(userId);
    return res.status(200).json(payload);
  } catch (err) {
    next(err);
  }
}

module.exports = { getLimit };
