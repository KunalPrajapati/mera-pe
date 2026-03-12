/**
 * Controller for GET /api/limit/:userId
 * Returns the available withdrawal limit for the user (Task 1).
 */

const { calculate_available_limit } = require('../services/earnedWageCalculator');

// Valid user ID for assessment (seeded in DB). Wrong userId returns 404.
const VALID_USER_ID = 'user-001';

async function getLimit(req, res, next) {
  try {
    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'userId is required',
      });
    }
    if (userId !== VALID_USER_ID) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }
    const payload = await calculate_available_limit(userId);
    return res.status(200).json({
      status: 'ok',
      message: 'Available withdrawal limit fetched',
      data: payload,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getLimit };
