/**
 * Global error handler middleware.
 * Sends appropriate HTTP status and JSON body for known and unknown errors.
 */

function errorHandler(err, req, res, next) {
  const code = err.statusCode || err.status || 500;
  const status = Math.min(999, Math.max(400, code));
  const message = err.message || 'Internal server error';

  if (status === 500) {
    console.error(err);
  }

  res.status(status).json({
    status: 'error',
    message,
  });
}

module.exports = { errorHandler };
