// middleware/auditLog.js
// Auto-logs actions after successful mutation requests

const pool = require('../db/pool');

/**
 * auditLog(action, entity)
 * Returns middleware that logs the action after the response is sent.
 * Captures: user info, entity ID from params/body/response, IP address.
 */
const auditLog = (action, entity) => (req, res, next) => {
  // Store original res.json to intercept the response
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    // Only log successful mutations (2xx status)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const entityId = req.params?.id || body?.id || body?.sale_number || null;
      const user = req.user || {};

      // Build details based on action type
      const details = action === 'login' ? { email: req.body?.email }
        : action === 'create_sale' ? { total: body?.total_amount, items: body?.items?.length, payment: body?.payment_method }
        : action === 'update_order_status' ? { status: req.body?.status }
        : action === 'create_expense' ? { category: body?.category, amount: body?.amount }
        : action === 'stock_movement' ? { type: req.body?.movement_type, qty: req.body?.quantity_change }
        : action === 'delete_product' ? { product_id: req.params?.id }
        : action === 'create_user' ? { email: body?.email, role: body?.role }
        : action === 'change_password' ? {}
        : { name: body?.name || req.body?.name };

      // Fire and forget — don't block the response
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
      const tenantId = req.tenant_id || user.tenant_id || null;
      pool.query(
        `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity, entity_id, details, ip_address)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [tenantId, user.id || null, user.name || null, user.role || null, action, entity, entityId, JSON.stringify(details), ip]
      ).catch(err => console.error('Audit log error:', err.message));
    }

    return originalJson(body);
  };

  next();
};

module.exports = auditLog;
