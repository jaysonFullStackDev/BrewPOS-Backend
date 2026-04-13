// controllers/salesController.js
// Processes sales transactions — tenant-scoped

const pool = require('../db/pool');

const processSale = async (req, res) => {
  const { items, payment_method, amount_tendered, discount = 0, notes } = req.body;

  if (!items || !items.length) return res.status(400).json({ error: 'No items in cart' });
  if (!['cash', 'card', 'ewallet', 'gcash', 'maya', 'gotyme', 'bank_transfer'].includes(payment_method)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }

  const TAX_RATE = parseFloat(process.env.TAX_RATE) || 0;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const productIds = items.map(i => i.product_id);
    const productsRes = await client.query(
      `SELECT id, name, price FROM products WHERE id = ANY($1) AND tenant_id = $2 AND is_available = TRUE`,
      [productIds, req.tenant_id]
    );
    const productMap = {};
    productsRes.rows.forEach(p => { productMap[p.id] = p; });

    for (const item of items) {
      if (!productMap[item.product_id]) throw new Error(`Product ${item.product_id} not found or unavailable`);
    }

    let subtotal = 0;
    for (const item of items) subtotal += productMap[item.product_id].price * item.quantity;

    const discountAmt  = parseFloat(discount) || 0;
    const taxable      = subtotal - discountAmt;
    const tax_amount   = parseFloat((taxable * TAX_RATE).toFixed(2));
    const total_amount = parseFloat((taxable + tax_amount).toFixed(2));
    const change_due   = payment_method === 'cash' ? Math.max(0, (amount_tendered || 0) - total_amount) : 0;

    const today    = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countRes = await client.query(
      `SELECT COUNT(*) FROM sales WHERE tenant_id = $1 AND created_at::date = CURRENT_DATE`,
      [req.tenant_id]
    );
    const seq = String(parseInt(countRes.rows[0].count) + 1).padStart(4, '0');
    const sale_number = `TXN-${today}-${seq}`;

    const saleRes = await client.query(
      `INSERT INTO sales (tenant_id, sale_number, cashier_id, subtotal, discount, tax_amount, total_amount, payment_method, amount_tendered, change_due, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.tenant_id, sale_number, req.user.id, subtotal, discountAmt, tax_amount, total_amount, payment_method, payment_method === 'cash' ? amount_tendered : null, change_due, notes || null]
    );
    const sale = saleRes.rows[0];

    for (const item of items) {
      const product = productMap[item.product_id];
      const itemTotal = parseFloat((product.price * item.quantity).toFixed(2));
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, product_name, unit_price, quantity, subtotal) VALUES ($1,$2,$3,$4,$5,$6)`,
        [sale.id, product.id, product.name, product.price, item.quantity, itemTotal]
      );
    }

    // Deduct ingredients
    const ingredientDeductions = {};
    for (const item of items) {
      const recipeRes = await client.query('SELECT ingredient_id, quantity FROM recipes WHERE product_id = $1', [item.product_id]);
      for (const r of recipeRes.rows) {
        ingredientDeductions[r.ingredient_id] = (ingredientDeductions[r.ingredient_id] || 0) + r.quantity * item.quantity;
      }
    }

    for (const [ingredientId, qty] of Object.entries(ingredientDeductions)) {
      const stockRes = await client.query('SELECT name, stock_qty, unit FROM ingredients WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [ingredientId, req.tenant_id]);
      const ing = stockRes.rows[0];
      if (!ing) throw new Error(`Ingredient ${ingredientId} not found`);
      if (parseFloat(ing.stock_qty) < qty) throw new Error(`Insufficient stock for "${ing.name}": need ${qty}${ing.unit}, only ${ing.stock_qty}${ing.unit} left`);

      await client.query('UPDATE ingredients SET stock_qty = stock_qty - $1 WHERE id = $2', [qty, ingredientId]);
      await client.query(
        `INSERT INTO stock_movements (tenant_id, ingredient_id, movement_type, quantity_change, notes, sale_id, recorded_by) VALUES ($1,$2,'sale_deduction',$3,$4,$5,$6)`,
        [req.tenant_id, ingredientId, -qty, `Sale ${sale_number}`, sale.id, req.user.id]
      );
    }

    await client.query('COMMIT');

    const io = req.app.get('io');
    if (io) {
      io.to(req.tenant_id).emit('order:new', {
        id: sale.id, sale_number, order_status: 'pending', created_at: sale.created_at, notes: notes || null, cashier_name: req.user.name,
        items: items.map(item => ({ product_name: productMap[item.product_id].name, quantity: item.quantity })),
      });
    }

    res.status(201).json({
      ...sale,
      items: items.map(item => ({ ...item, product_name: productMap[item.product_id].name, unit_price: productMap[item.product_id].price, subtotal: parseFloat((productMap[item.product_id].price * item.quantity).toFixed(2)) })),
      cashier_name: req.user.name,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Sale error:', err);
    const status = err.message?.includes('Insufficient stock') ? 409 : 500;
    res.status(status).json({ error: err.message || 'Failed to process sale' });
  } finally {
    client.release();
  }
};

const getSales = async (req, res) => {
  try {
    const { from, to, cashier_id, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [req.tenant_id];
    const conditions = ['s.tenant_id = $1'];

    if (from)       { params.push(from);       conditions.push(`s.created_at >= $${params.length}`); }
    if (to)         { params.push(to);         conditions.push(`s.created_at <= $${params.length}::date + interval '1 day'`); }
    if (cashier_id) { params.push(cashier_id); conditions.push(`s.cashier_id = $${params.length}`); }

    params.push(parseInt(limit), offset);
    const result = await pool.query(`
      SELECT s.*, u.name AS cashier_name FROM sales s LEFT JOIN users u ON u.id = s.cashier_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY s.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getSale = async (req, res) => {
  try {
    const saleRes = await pool.query(
      `SELECT s.*, u.name AS cashier_name FROM sales s LEFT JOIN users u ON u.id = s.cashier_id
       WHERE s.id = $1 AND s.tenant_id = $2`, [req.params.id, req.tenant_id]
    );
    if (!saleRes.rows.length) return res.status(404).json({ error: 'Sale not found' });
    const items = await pool.query('SELECT * FROM sale_items WHERE sale_id = $1', [req.params.id]);
    res.json({ ...saleRes.rows[0], items: items.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { processSale, getSales, getSale };
