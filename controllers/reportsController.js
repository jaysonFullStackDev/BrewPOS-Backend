// controllers/reportsController.js
// Sales analytics, top products, inventory usage — tenant-scoped

const pool = require('../db/pool');

const getSalesSummary = async (req, res) => {
  try {
    const { period = 'daily', year = new Date().getFullYear() } = req.query;
    let groupBy, label;
    if (period === 'daily')       { groupBy = `DATE_TRUNC('day', created_at)`;   label = `TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD')`; }
    else if (period === 'weekly') { groupBy = `DATE_TRUNC('week', created_at)`;  label = `'Week ' || TO_CHAR(DATE_TRUNC('week', created_at), 'WW YYYY')`; }
    else                          { groupBy = `DATE_TRUNC('month', created_at)`; label = `TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY')`; }

    const result = await pool.query(`
      SELECT ${label} AS period, COUNT(*) AS transaction_count, COALESCE(SUM(total_amount),0) AS revenue,
             COALESCE(SUM(discount),0) AS discounts, COALESCE(SUM(tax_amount),0) AS tax, COALESCE(AVG(total_amount),0) AS avg_transaction
      FROM sales WHERE tenant_id = $1 AND EXTRACT(YEAR FROM created_at) = $2
      GROUP BY ${groupBy} ORDER BY ${groupBy} DESC LIMIT 90
    `, [req.tenant_id, year]);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

const getTopProducts = async (req, res) => {
  try {
    const { from, to, limit = 10 } = req.query;
    const params = [req.tenant_id, parseInt(limit)];
    const conditions = ['s.tenant_id = $1'];

    if (from) { params.push(from); conditions.push(`s.created_at >= $${params.length}`); }
    if (to)   { params.push(to);   conditions.push(`s.created_at <= $${params.length}::date + interval '1 day'`); }

    const result = await pool.query(`
      SELECT si.product_name, SUM(si.quantity) AS units_sold, SUM(si.subtotal) AS revenue
      FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY si.product_name ORDER BY units_sold DESC LIMIT $2
    `, params);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

const getInventoryUsage = async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [req.tenant_id];
    const conditions = ['sm.tenant_id = $1', "sm.movement_type = 'sale_deduction'"];

    if (from) { params.push(from); conditions.push(`sm.created_at >= $${params.length}`); }
    if (to)   { params.push(to);   conditions.push(`sm.created_at <= $${params.length}::date + interval '1 day'`); }

    const result = await pool.query(`
      SELECT i.name, i.unit, ABS(SUM(sm.quantity_change)) AS total_used, i.cost_per_unit,
             ABS(SUM(sm.quantity_change)) * i.cost_per_unit AS total_cost
      FROM stock_movements sm JOIN ingredients i ON i.id = sm.ingredient_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY i.id, i.name, i.unit, i.cost_per_unit ORDER BY total_cost DESC
    `, params);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

const getDashboardStats = async (req, res) => {
  try {
    const tid = req.tenant_id;
    const todayRes = await pool.query(
      `SELECT COUNT(*) AS transactions, COALESCE(SUM(total_amount),0) AS revenue FROM sales WHERE tenant_id=$1 AND created_at::date = CURRENT_DATE`, [tid]
    );
    const monthRes = await pool.query(
      `SELECT COALESCE(SUM(total_amount),0) AS revenue FROM sales WHERE tenant_id=$1 AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`, [tid]
    );
    const lowStockRes = await pool.query(
      `SELECT COUNT(*) AS count FROM ingredients WHERE tenant_id=$1 AND stock_qty <= low_stock_alert`, [tid]
    );
    const topTodayRes = await pool.query(
      `SELECT si.product_name, SUM(si.quantity) AS units FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE s.tenant_id=$1 AND s.created_at::date = CURRENT_DATE GROUP BY si.product_name ORDER BY units DESC LIMIT 1`, [tid]
    );

    res.json({
      today: { transactions: parseInt(todayRes.rows[0].transactions), revenue: parseFloat(todayRes.rows[0].revenue) },
      this_month: { revenue: parseFloat(monthRes.rows[0].revenue) },
      low_stock_count: parseInt(lowStockRes.rows[0].count),
      top_product_today: topTodayRes.rows[0] || null,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

module.exports = { getSalesSummary, getTopProducts, getInventoryUsage, getDashboardStats };
