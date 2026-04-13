// controllers/inventoryController.js
// Manage ingredients, stock, movements, suppliers — tenant-scoped

const pool = require('../db/pool');

const getIngredients = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*, s.name AS supplier_name,
             CASE WHEN i.stock_qty <= i.low_stock_alert THEN TRUE ELSE FALSE END AS is_low_stock
      FROM ingredients i LEFT JOIN suppliers s ON s.id = i.supplier_id
      WHERE i.tenant_id = $1 ORDER BY i.name
    `, [req.tenant_id]);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

const createIngredient = async (req, res) => {
  try {
    const { name, unit, stock_qty = 0, low_stock_alert = 100, cost_per_unit = 0, supplier_id } = req.body;
    const result = await pool.query(
      `INSERT INTO ingredients (tenant_id, name, unit, stock_qty, low_stock_alert, cost_per_unit, supplier_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.tenant_id, name, unit, stock_qty, low_stock_alert, cost_per_unit, supplier_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

const updateIngredient = async (req, res) => {
  try {
    const { name, unit, low_stock_alert, cost_per_unit, supplier_id } = req.body;
    const result = await pool.query(
      `UPDATE ingredients SET name=$1, unit=$2, low_stock_alert=$3, cost_per_unit=$4, supplier_id=$5
       WHERE id=$6 AND tenant_id=$7 RETURNING *`,
      [name, unit, low_stock_alert, cost_per_unit, supplier_id || null, req.params.id, req.tenant_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

const addStockMovement = async (req, res) => {
  try {
    const { ingredient_id, movement_type, quantity_change, notes } = req.body;
    if (!['purchase', 'wastage', 'adjustment'].includes(movement_type)) {
      return res.status(400).json({ error: 'Invalid movement_type' });
    }
    const signedQty = movement_type === 'wastage' ? -Math.abs(quantity_change) : parseFloat(quantity_change);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE ingredients SET stock_qty = stock_qty + $1 WHERE id = $2 AND tenant_id = $3', [signedQty, ingredient_id, req.tenant_id]);
      const moveRes = await client.query(
        `INSERT INTO stock_movements (tenant_id, ingredient_id, movement_type, quantity_change, notes, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.tenant_id, ingredient_id, movement_type, signedQty, notes || null, req.user.id]
      );
      const ingRes = await client.query('SELECT *, stock_qty <= low_stock_alert AS is_low_stock FROM ingredients WHERE id=$1', [ingredient_id]);
      await client.query('COMMIT');
      res.status(201).json({ movement: moveRes.rows[0], ingredient: ingRes.rows[0] });
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

const getStockMovements = async (req, res) => {
  try {
    const { ingredient_id, limit = 100 } = req.query;
    const params = [req.tenant_id];
    const conditions = ['sm.tenant_id = $1'];

    if (ingredient_id) { params.push(ingredient_id); conditions.push(`sm.ingredient_id = $${params.length}`); }

    params.push(parseInt(limit));
    const result = await pool.query(`
      SELECT sm.*, i.name AS ingredient_name, i.unit, u.name AS recorded_by_name
      FROM stock_movements sm JOIN ingredients i ON i.id = sm.ingredient_id LEFT JOIN users u ON u.id = sm.recorded_by
      WHERE ${conditions.join(' AND ')}
      ORDER BY sm.created_at DESC LIMIT $${params.length}
    `, params);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

const getLowStockAlerts = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *, (low_stock_alert - stock_qty) AS deficit
      FROM ingredients WHERE tenant_id = $1 AND stock_qty <= low_stock_alert ORDER BY deficit DESC
    `, [req.tenant_id]);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

const getSuppliers = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM suppliers WHERE tenant_id = $1 ORDER BY name', [req.tenant_id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

const createSupplier = async (req, res) => {
  try {
    const { name, contact, phone, email, address, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO suppliers (tenant_id, name, contact, phone, email, address, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.tenant_id, name, contact, phone, email, address, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

module.exports = { getIngredients, createIngredient, updateIngredient, addStockMovement, getStockMovements, getLowStockAlerts, getSuppliers, createSupplier };
