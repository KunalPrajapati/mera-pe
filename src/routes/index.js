const express = require('express');
const limitController = require('../controllers/limitController');
const withdrawController = require('../controllers/withdrawController');
const { rateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// 1) Get available withdrawal limit for a user (Task 1)
router.get('/limit/:userId', limitController.getLimit);

// 2) Process withdrawal (Task 2) — body: { userId, amount, idempotencyKey }; rate-limited (429)
router.post('/withdraw', rateLimiter, withdrawController.withdraw);

module.exports = router;
