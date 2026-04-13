// controllers/authController.js
// Login (email/password + Google OAuth), token refresh, tenant setup

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool   = require('../db/pool');
const { checkAccountLockout, recordFailedLogin, clearFailedLogins } = require('../middleware/security');

const ACCESS_EXPIRES  = '7d';
const REFRESH_EXPIRES_DAYS = 30;
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/tokeninfo';

function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name, tenant_id: user.tenant_id },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES }
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createRefreshTokenPair(userId) {
  const refreshToken = generateRefreshToken();
  const family = uuidv4();
  const hash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, family, expires_at) VALUES ($1, $2, $3, $4)`,
    [userId, hash, family, expiresAt]
  );
  return refreshToken;
}

// ── POST /api/auth/login (email + password) ───────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query(
      `SELECT u.*, t.is_setup_done FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = $1 AND u.is_active = TRUE AND u.password IS NOT NULL`,
      [email.toLowerCase().trim()]
    );
    if (result.rows.length === 0) {
      recordFailedLogin(email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      recordFailedLogin(email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    clearFailedLogins(email);

    const token = signAccessToken(user);
    const refreshToken = await createRefreshTokenPair(user.id);

    res.json({
      token,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, tenant_id: user.tenant_id, avatar_url: user.avatar_url },
      is_setup_done: user.is_setup_done,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
};

// ── POST /api/auth/google ─────────────────────────────────
// Verifies Google ID token. Creates tenant + admin on first sign-in.
const googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Google credential is required' });
    }

    // Verify the ID token with Google
    const verifyRes = await fetch(`${GOOGLE_TOKEN_URL}?id_token=${credential}`);
    if (!verifyRes.ok) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }
    const payload = await verifyRes.json();

    // Validate audience matches our client ID
    if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
      return res.status(401).json({ error: 'Token audience mismatch' });
    }

    const { sub: googleId, email, name, picture } = payload;

    // Check if user already exists
    const existing = await pool.query(
      `SELECT u.*, t.is_setup_done FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.google_id = $1`,
      [googleId]
    );

    let user;
    if (existing.rows.length > 0) {
      user = existing.rows[0];
    } else {
      // Check if email is already used by a non-Google account
      const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({ error: 'An account with this email already exists. Please log in with your password.' });
      }

      // First-time Google sign-in → create tenant + admin user
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const tenantRes = await client.query(
          `INSERT INTO tenants (company_name) VALUES ($1) RETURNING *`,
          [`${name}'s Coffee Shop`]
        );
        const tenant = tenantRes.rows[0];

        const userRes = await client.query(
          `INSERT INTO users (tenant_id, name, email, google_id, avatar_url, role)
           VALUES ($1, $2, $3, $4, $5, 'admin') RETURNING *`,
          [tenant.id, name, email, googleId, picture]
        );
        user = { ...userRes.rows[0], is_setup_done: false };

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const token = signAccessToken(user);
    const refreshToken = await createRefreshTokenPair(user.id);

    res.json({
      token,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, tenant_id: user.tenant_id, avatar_url: user.avatar_url },
      is_setup_done: user.is_setup_done,
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Server error during Google authentication' });
  }
};

// ── PUT /api/auth/tenant-setup (admin only) ───────────────
const tenantSetup = async (req, res) => {
  try {
    const { company_name, address, phone, payment_config } = req.body;
    if (!company_name) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    // Validate payment_config structure
    const validProviders = ['gcash', 'maya', 'gotyme', 'bank_transfer'];
    const sanitized = {};
    if (payment_config) {
      for (const key of validProviders) {
        if (payment_config[key]) {
          sanitized[key] = {
            enabled: !!payment_config[key].enabled,
            account_name:   (payment_config[key].account_name   || '').slice(0, 200),
            account_number: (payment_config[key].account_number || '').slice(0, 50),
            bank_name:      (payment_config[key].bank_name      || '').slice(0, 100),
          };
        }
      }
    }

    const result = await pool.query(
      `UPDATE tenants
       SET company_name = $1, address = $2, phone = $3, payment_config = $4, is_setup_done = TRUE
       WHERE id = $5 RETURNING *`,
      [company_name, address || null, phone || null, JSON.stringify(sanitized), req.tenant_id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Tenant setup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── GET /api/auth/tenant ──────────────────────────────────
const getTenant = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tenants WHERE id = $1', [req.tenant_id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GetTenant error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── POST /api/auth/refresh ────────────────────────────────
const refresh = async (req, res) => {
  const client = await pool.connect();
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token is required' });

    const hash = hashToken(refreshToken);
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT rt.*, u.email, u.role, u.name, u.is_active, u.tenant_id, u.avatar_url
       FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1`, [hash]
    );

    if (result.rows.length === 0) {
      await client.query('COMMIT');
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const row = result.rows[0];

    if (row.revoked) {
      await client.query('UPDATE refresh_tokens SET revoked = TRUE WHERE family = $1', [row.family]);
      await client.query('COMMIT');
      return res.status(401).json({ error: 'Token reuse detected — session revoked' });
    }

    if (new Date(row.expires_at) < new Date() || !row.is_active) {
      await client.query('COMMIT');
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    await client.query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [row.id]);

    const newRefreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, family, expires_at) VALUES ($1, $2, $3, $4)`,
      [row.user_id, hashToken(newRefreshToken), row.family, expiresAt]
    );

    await client.query('COMMIT');

    const token = signAccessToken(row);
    res.json({
      token,
      refreshToken: newRefreshToken,
      user: { id: row.user_id, name: row.name, email: row.email, role: row.role, tenant_id: row.tenant_id, avatar_url: row.avatar_url },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

// ── POST /api/auth/logout ─────────────────────────────────
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.json({ message: 'Logged out' });
    const hash = hashToken(refreshToken);
    const result = await pool.query('SELECT family FROM refresh_tokens WHERE token_hash = $1', [hash]);
    if (result.rows.length > 0) {
      await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE family = $1', [result.rows[0].family]);
    }
    res.json({ message: 'Logged out' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── GET /api/auth/me ──────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.avatar_url, u.tenant_id, u.created_at, t.is_setup_done, t.company_name
       FROM users u JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1`, [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GetMe error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── GET /api/auth/users (admin/manager) ───────────────────
const getUsers = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, is_active, avatar_url, created_at FROM users WHERE tenant_id = $1 ORDER BY name',
      [req.tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GetUsers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── POST /api/auth/users (admin only) ─────────────────────
const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) return res.status(400).json({ error: 'All fields required' });
    if (!['admin', 'manager', 'cashier'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (tenant_id, name, email, password, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, created_at`,
      [req.tenant_id, name, email.toLowerCase().trim(), hashed, role]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists in this organization' });
    console.error('CreateUser error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── PUT /api/auth/change-password ─────────────────────────
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

    const result = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    if (!result.rows[0].password) return res.status(400).json({ error: 'Google-authenticated accounts cannot change password here' });

    const isMatch = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!isMatch) return res.status(401).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, req.user.id]);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('ChangePassword error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { login, googleAuth, tenantSetup, getTenant, refresh, logout, getMe, getUsers, createUser, changePassword };
