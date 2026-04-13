// middleware/security.js
// Additional security hardening

const crypto = require('crypto');

// ── Input sanitizer — strips HTML/script tags from string fields ──
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').replace(/javascript:/gi, '').trim();
}

function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeString(req.body[key]);
      }
    }
  }
  next();
}

// ── Account lockout tracker (in-memory, per-email) ───────
const loginAttempts = new Map(); // email → { count, lockedUntil }
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function checkAccountLockout(req, res, next) {
  const email = (req.body.email || '').toLowerCase().trim();
  if (!email) return next();

  const record = loginAttempts.get(email);
  if (record && record.lockedUntil && Date.now() < record.lockedUntil) {
    const mins = Math.ceil((record.lockedUntil - Date.now()) / 60000);
    return res.status(429).json({ error: `Account temporarily locked. Try again in ${mins} minute(s).` });
  }
  next();
}

function recordFailedLogin(email) {
  const key = email.toLowerCase().trim();
  const record = loginAttempts.get(key) || { count: 0, lockedUntil: null };
  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
    record.count = 0;
  }
  loginAttempts.set(key, record);
}

function clearFailedLogins(email) {
  loginAttempts.delete(email.toLowerCase().trim());
}

// ── Cleanup stale lockout entries every 30 min ───────────
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginAttempts) {
    if (record.lockedUntil && now > record.lockedUntil) loginAttempts.delete(key);
  }
}, 30 * 60 * 1000);

module.exports = { sanitizeBody, checkAccountLockout, recordFailedLogin, clearFailedLogins };
