// controllers/productsController.js
// CRUD for products and categories — tenant-scoped

const pool = require('../db/pool');

/** GET /api/products */
const getProducts = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, c.name AS category_name, c.color AS category_color
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.tenant_id = $1
      ORDER BY c.name, p.name
    `, [req.tenant_id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

/** GET /api/products/:id */
const getProduct = async (req, res) => {
  try {
    const product = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = $1 AND p.tenant_id = $2`, [req.params.id, req.tenant_id]
    );
    if (!product.rows.length) return res.status(404).json({ error: 'Not found' });

    const recipe = await pool.query(`
      SELECT r.*, i.name AS ingredient_name, i.unit
      FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id
      WHERE r.product_id = $1
    `, [req.params.id]);

    res.json({ ...product.rows[0], recipe: recipe.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

/** POST /api/products */
const createProduct = async (req, res) => {
  try {
    const { name, description, price, category_id, recipe } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const p = await client.query(
        `INSERT INTO products (tenant_id, name, description, price, category_id)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.tenant_id, name, description, price, category_id]
      );
      const product = p.rows[0];

      if (recipe && recipe.length) {
        for (const item of recipe) {
          await client.query(
            `INSERT INTO recipes (product_id, ingredient_id, quantity) VALUES ($1,$2,$3)`,
            [product.id, item.ingredient_id, item.quantity]
          );
        }
      }

      await client.query('COMMIT');
      res.status(201).json(product);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

/** PUT /api/products/:id */
const updateProduct = async (req, res) => {
  try {
    const { name, description, price, category_id, is_available } = req.body;
    const result = await pool.query(
      `UPDATE products SET name=$1, description=$2, price=$3, category_id=$4, is_available=$5
       WHERE id=$6 AND tenant_id=$7 RETURNING *`,
      [name, description, price, category_id, is_available, req.params.id, req.tenant_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

/** DELETE /api/products/:id */
const deleteProduct = async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenant_id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

/** GET /api/categories */
const getCategories = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories WHERE tenant_id = $1 ORDER BY name', [req.tenant_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

/** POST /api/categories */
const createCategory = async (req, res) => {
  try {
    const { name, color, icon } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const result = await pool.query(
      `INSERT INTO categories (tenant_id, name, color, icon) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.tenant_id, name, color || '#8B6F47', icon || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getProducts, getProduct, createProduct, updateProduct, deleteProduct, getCategories, createCategory };
