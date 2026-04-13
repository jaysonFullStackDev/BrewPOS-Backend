// middleware/auth.js
// JWT authentication + role-based authorization + tenant scoping + demo guard

const jwt = require('jsonwebtoken');

const DEMO_TENANT_ID = 'f1000000-0000-0000-0000-000000000001';
const DEMO_EMAILS = ['admin@brewpos.com', 'manager@brewpos.com', 'cashier@brewpos.com'];

const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    req.tenant_id = decoded.tenant_id;

    // Block writes for demo accounts
    const isDemo = decoded.tenant_id === DEMO_TENANT_ID || DEMO_EMAILS.includes(decoded.email);
    const method = req.method.toUpperCase();
    if (isDemo && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return res.status(403).json({
        error: 'Demo accounts are read-only. Sign up with Google to create your own shop!'
      });
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({
      error: `Access denied. Required role(s): ${roles.join(', ')}`
    });
  }
  next();
};

module.exports = { authenticate, authorize };
