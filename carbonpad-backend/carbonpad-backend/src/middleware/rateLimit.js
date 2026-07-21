const rateLimit = require('express-rate-limit');

// Slows down password guessing / lock spam without needing extra infra.
// In a multi-instance deployment, swap the default memory store for a
// Redis-backed store (rate-limit-redis) so limits are shared across instances.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many attempts — try again in a few minutes' },
});

module.exports = { authLimiter };
