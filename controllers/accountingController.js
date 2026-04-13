// controllers/accountingController.js
// Expenses, P&L, cash flow — tenant-scoped

const pool = require('../db/pool');

const createExpense = async (req, res) => {
  try {
    const { category, description, amount, expense_date } = req.body;
    const result = await pool.query(
      `INSERT INTO expenses (tenant_id, category, description, amount, expense_date, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.tenant_id, category, description, amount, expense_date || new Date(), req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

const getExpenses = async (req, res) => {
  try {
    const { from, to, category } = req.query;
    const params = [req.tenant_id];
    const conditions = ['e.tenant_id = $1'];

    if (from)     { params.push(from);     conditions.push(`e.expense_date >= $${params.length}`); }
    if (to)       { params.push(to);       conditions.push(`e.expense_date <= $${params.length}`); }
    if (category) { params.push(category); conditions.push(`e.category = $${params.length}`); }

    const result = await pool.query(`
      SELECT e.*, u.name AS recorded_by_name FROM expenses e LEFT JOIN users u ON u.id = e.recorded_by
      WHERE ${conditions.join(' AND ')} ORDER BY e.expense_date DESC, e.created_at DESC
    `, params);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

const getProfitAndLoss = async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [req.tenant_id];
    const salesCond = ['tenant_id = $1'];
    const expCond   = ['tenant_id = $1'];

    if (from) { params.push(from); salesCond.push(`created_at >= $${params.length}`); expCond.push(`expense_date >= $${params.length}`); }
    if (to)   { params.push(to);   salesCond.push(`created_at <= $${params.length}::date + interval '1 day'`); expCond.push(`expense_date <= $${params.length}`); }

    const revenueRes = await pool.query(`
      SELECT COALESCE(SUM(subtotal),0) AS gross_sales, COALESCE(SUM(discount),0) AS total_discounts,
             COALESCE(SUM(tax_amount),0) AS total_tax, COALESCE(SUM(total_amount),0) AS net_revenue, COUNT(*) AS transaction_count
      FROM sales WHERE ${salesCond.join(' AND ')}
    `, params);

    const expensesRes = await pool.query(`
      SELECT category, COALESCE(SUM(amount),0) AS total FROM expenses
      WHERE ${expCond.join(' AND ')} GROUP BY category ORDER BY total DESC
    `, params);

    const revenue = revenueRes.rows[0];
    const expenses = expensesRes.rows;
    const totalExpenses = expenses.reduce((s, e) => s + parseFloat(e.total), 0);
    const grossProfit = parseFloat(revenue.net_revenue) - totalExpenses;

    res.json({
      period: { from, to },
      gross_sales: parseFloat(revenue.gross_sales), total_discounts: parseFloat(revenue.total_discounts),
      total_tax: parseFloat(revenue.total_tax), net_revenue: parseFloat(revenue.net_revenue),
      transaction_count: parseInt(revenue.transaction_count),
      expenses_by_category: expenses.map(e => ({ category: e.category, total: parseFloat(e.total) })),
      total_expenses: parseFloat(totalExpenses.toFixed(2)), gross_profit: parseFloat(grossProfit.toFixed(2)),
      profit_margin: revenue.net_revenue > 0 ? parseFloat(((grossProfit / parseFloat(revenue.net_revenue)) * 100).toFixed(2)) : 0,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

const getCashFlow = async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const revenueRes = await pool.query(`
      SELECT EXTRACT(MONTH FROM created_at) AS month, COALESCE(SUM(total_amount),0) AS revenue
      FROM sales WHERE tenant_id = $1 AND EXTRACT(YEAR FROM created_at) = $2 GROUP BY month ORDER BY month
    `, [req.tenant_id, year]);

    const expensesRes = await pool.query(`
      SELECT EXTRACT(MONTH FROM expense_date) AS month, COALESCE(SUM(amount),0) AS expenses
      FROM expenses WHERE tenant_id = $1 AND EXTRACT(YEAR FROM expense_date) = $2 GROUP BY month ORDER BY month
    `, [req.tenant_id, year]);

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const revMap = {}; const expMap = {};
    revenueRes.rows.forEach(r => { revMap[r.month] = parseFloat(r.revenue); });
    expensesRes.rows.forEach(e => { expMap[e.month] = parseFloat(e.expenses); });

    const cashflow = months.map((label, i) => {
      const m = i + 1; const revenue = revMap[m] || 0; const expenses = expMap[m] || 0;
      return { month: label, revenue, expenses, net: revenue - expenses };
    });
    res.json({ year: parseInt(year), cashflow });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

module.exports = { createExpense, getExpenses, getProfitAndLoss, getCashFlow };
