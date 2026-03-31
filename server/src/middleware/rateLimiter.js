const rateLimit = require("express-rate-limit");

const createLimiter = (options) =>
  rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true,
    ...options,
  });

const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: "Too many authentication attempts, please try again later" },
});

const messageLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "Too many messages, please slow down" },
});

const uploadLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many file uploads, please slow down" },
});

const apiLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please slow down" },
});

module.exports = {
  authLimiter,
  messageLimiter,
  uploadLimiter,
  apiLimiter,
};