/**
 * Simple in-memory rate limiter for sensitive endpoints (e.g. withdraw).
 * Returns 429 Too Many Requests when limit exceeded.
 */

const windowMs = 60 * 1000; // 1 minute
const maxPerWindow = 30;
const store = new Map();

function rateLimiter(req, res, next) {
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = store.get(key);
  if (!entry) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count++;
  if (entry.count > maxPerWindow) {
    return res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Try again later.',
    });
  }
  next();
}

module.exports = { rateLimiter };
