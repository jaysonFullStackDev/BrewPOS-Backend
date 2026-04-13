// controllers/ordersController.js
// Kitchen Display System — tenant-scoped

const pool = require('../db/pool');

const getActiveOrders = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.id, s.sale_number, s.order_status, s.created_at, s.notes, u.name AS cashier_name,
             json_agg(json_build_object('product_name', si.product_name, 'quantity', si.quantity) ORDER BY si.product_name) AS items
      FROM sales s LEFT JOIN users u ON u.id = s.cashier_id JOIN sale_items si ON si.sale_id = s.id
      WHERE s.tenant_id = $1 AND s.order_status IN ('pending', 'preparing', 'ready')
      GROUP BY s.id, u.name
      ORDER BY CASE s.order_status WHEN 'pending' THEN 1 WHEN 'preparing' THEN 2 WHEN 'ready' THEN 3 END, s.created_at ASC
    `, [req.tenant_id]);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const VALID = ['pending', 'preparing', 'ready', 'completed'];
  if (!VALID.includes(status)) return res.status(400).json({ error: `Invalid status` });

  try {
    const result = await pool.query(
      `UPDATE sales SET order_status = $1 WHERE id = $2 AND tenant_id = $3
       RETURNING id, sale_number, order_status, created_at, notes`,
      [status, id, req.tenant_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Order not found' });

    const order = result.rows[0];
    const io = req.app.get('io');
    if (io) io.to(req.tenant_id).emit('order:update', order);
    res.json(order);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

module.exports = { getActiveOrders, updateOrderStatus };
