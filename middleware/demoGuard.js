// middleware/demoGuard.js
// Blocks write operations for demo tenant users and resets data on logout

const pool = require('../db/pool');
const bcrypt = require('bcryptjs');

const DEMO_TENANT_ID = 'f1000000-0000-0000-0000-000000000001';
const DEMO_EMAILS = ['admin@brewpos.com', 'manager@brewpos.com', 'cashier@brewpos.com'];

function isDemoUser(req) {
  return req.tenant_id === DEMO_TENANT_ID || DEMO_EMAILS.includes(req.user?.email);
}

// Middleware: block POST/PUT/DELETE for demo users
const blockDemoWrites = (req, res, next) => {
  if (!isDemoUser(req)) return next();
  const method = req.method.toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return res.status(403).json({
      error: 'Demo accounts are read-only. Sign up with Google to create your own shop!'
    });
  }
  next();
};

// Reset demo tenant data back to seed state
async function resetDemoTenant() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const t = DEMO_TENANT_ID;

    // Delete all non-seed data for demo tenant (order matters for FK constraints)
    await client.query('DELETE FROM audit_logs WHERE tenant_id = $1', [t]);
    await client.query('DELETE FROM stock_movements WHERE tenant_id = $1', [t]);
    await client.query('DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE tenant_id = $1)', [t]);
    await client.query('DELETE FROM sales WHERE tenant_id = $1', [t]);
    await client.query('DELETE FROM expenses WHERE tenant_id = $1', [t]);
    await client.query('DELETE FROM recipes WHERE product_id IN (SELECT id FROM products WHERE tenant_id = $1)', [t]);
    await client.query('DELETE FROM products WHERE tenant_id = $1', [t]);
    await client.query('DELETE FROM ingredients WHERE tenant_id = $1', [t]);
    await client.query('DELETE FROM categories WHERE tenant_id = $1', [t]);
    await client.query('DELETE FROM suppliers WHERE tenant_id = $1', [t]);
    await client.query('DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)', [t]);

    // Re-insert seed suppliers
    await client.query(`INSERT INTO suppliers (id, tenant_id, name, contact, phone, email, address) VALUES
      ('b1000000-0000-0000-0000-000000000001', $1, 'Metro Coffee Distributors', 'Juan dela Cruz', '+63-2-8123-4567', 'orders@metrocoffee.ph', 'Quezon City, Metro Manila'),
      ('b1000000-0000-0000-0000-000000000002', $1, 'FreshMilk Farms', 'Maria Santos', '+63-917-555-0001', 'supply@freshmilk.ph', 'Batangas Province'),
      ('b1000000-0000-0000-0000-000000000003', $1, 'SweetSource Ingredients', 'Carlo Reyes', '+63-32-412-9988', 'sales@sweetsource.ph', 'Cebu City')
      ON CONFLICT DO NOTHING`, [t]);

    // Re-insert seed categories
    await client.query(`INSERT INTO categories (id, tenant_id, name, color, icon) VALUES
      ('c1000000-0000-0000-0000-000000000001', $1, 'Hot Coffee', '#6F4E37', 'coffee'),
      ('c1000000-0000-0000-0000-000000000002', $1, 'Cold Coffee', '#4A90D9', 'snowflake'),
      ('c1000000-0000-0000-0000-000000000003', $1, 'Non-Coffee', '#E8A87C', 'leaf'),
      ('c1000000-0000-0000-0000-000000000004', $1, 'Pastries', '#D4A373', 'cake'),
      ('c1000000-0000-0000-0000-000000000005', $1, 'Merchandise', '#9B8B7A', 'bag')
      ON CONFLICT DO NOTHING`, [t]);

    // Re-insert seed ingredients
    await client.query(`INSERT INTO ingredients (id, tenant_id, name, unit, stock_qty, low_stock_alert, cost_per_unit, supplier_id) VALUES
      ('d1000000-0000-0000-0000-000000000001', $1, 'Espresso Beans', 'g', 5000, 500, 0.045, 'b1000000-0000-0000-0000-000000000001'),
      ('d1000000-0000-0000-0000-000000000002', $1, 'Fresh Milk', 'ml', 10000, 1000, 0.003, 'b1000000-0000-0000-0000-000000000002'),
      ('d1000000-0000-0000-0000-000000000003', $1, 'Heavy Cream', 'ml', 3000, 300, 0.006, 'b1000000-0000-0000-0000-000000000002'),
      ('d1000000-0000-0000-0000-000000000004', $1, 'White Sugar', 'g', 8000, 500, 0.002, 'b1000000-0000-0000-0000-000000000003'),
      ('d1000000-0000-0000-0000-000000000005', $1, 'Brown Sugar', 'g', 3000, 300, 0.003, 'b1000000-0000-0000-0000-000000000003'),
      ('d1000000-0000-0000-0000-000000000006', $1, 'Vanilla Syrup', 'ml', 2000, 200, 0.012, 'b1000000-0000-0000-0000-000000000003'),
      ('d1000000-0000-0000-0000-000000000007', $1, 'Caramel Syrup', 'ml', 2000, 200, 0.014, 'b1000000-0000-0000-0000-000000000003'),
      ('d1000000-0000-0000-0000-000000000008', $1, 'Hazelnut Syrup', 'ml', 1500, 200, 0.015, 'b1000000-0000-0000-0000-000000000003'),
      ('d1000000-0000-0000-0000-000000000009', $1, 'Chocolate Powder', 'g', 2000, 200, 0.008, 'b1000000-0000-0000-0000-000000000003'),
      ('d1000000-0000-0000-0000-000000000010', $1, 'Matcha Powder', 'g', 1000, 100, 0.025, 'b1000000-0000-0000-0000-000000000003'),
      ('d1000000-0000-0000-0000-000000000011', $1, 'Ice', 'g', 20000, 2000, 0.0005, 'b1000000-0000-0000-0000-000000000002'),
      ('d1000000-0000-0000-0000-000000000012', $1, 'Paper Cup 12oz', 'pcs', 500, 100, 2.50, 'b1000000-0000-0000-0000-000000000003'),
      ('d1000000-0000-0000-0000-000000000013', $1, 'Paper Cup 16oz', 'pcs', 500, 100, 3.00, 'b1000000-0000-0000-0000-000000000003'),
      ('d1000000-0000-0000-0000-000000000014', $1, 'Whipped Cream', 'ml', 2000, 300, 0.008, 'b1000000-0000-0000-0000-000000000002'),
      ('d1000000-0000-0000-0000-000000000015', $1, 'Croissant (baked)', 'pcs', 30, 5, 35.00, 'b1000000-0000-0000-0000-000000000003'),
      ('d1000000-0000-0000-0000-000000000016', $1, 'Muffin (baked)', 'pcs', 20, 5, 28.00, 'b1000000-0000-0000-0000-000000000003')
      ON CONFLICT DO NOTHING`, [t]);

    // Re-insert seed products
    await client.query(`INSERT INTO products (id, tenant_id, name, description, price, category_id) VALUES
      ('e1000000-0000-0000-0000-000000000001', $1, 'Espresso', 'Double shot of rich espresso', 90.00, 'c1000000-0000-0000-0000-000000000001'),
      ('e1000000-0000-0000-0000-000000000002', $1, 'Americano', 'Espresso with hot water', 110.00, 'c1000000-0000-0000-0000-000000000001'),
      ('e1000000-0000-0000-0000-000000000003', $1, 'Cappuccino', 'Espresso, steamed milk, foam', 135.00, 'c1000000-0000-0000-0000-000000000001'),
      ('e1000000-0000-0000-0000-000000000004', $1, 'Latte', 'Espresso with steamed milk', 140.00, 'c1000000-0000-0000-0000-000000000001'),
      ('e1000000-0000-0000-0000-000000000005', $1, 'Caramel Macchiato', 'Vanilla latte with caramel drizzle', 165.00, 'c1000000-0000-0000-0000-000000000001'),
      ('e1000000-0000-0000-0000-000000000006', $1, 'Mocha', 'Espresso, chocolate, steamed milk', 155.00, 'c1000000-0000-0000-0000-000000000001'),
      ('e1000000-0000-0000-0000-000000000007', $1, 'Iced Americano', 'Espresso over ice with water', 120.00, 'c1000000-0000-0000-0000-000000000002'),
      ('e1000000-0000-0000-0000-000000000008', $1, 'Iced Latte', 'Espresso over ice with milk', 150.00, 'c1000000-0000-0000-0000-000000000002'),
      ('e1000000-0000-0000-0000-000000000009', $1, 'Cold Brew', 'Slow-steeped cold coffee', 160.00, 'c1000000-0000-0000-0000-000000000002'),
      ('e1000000-0000-0000-0000-000000000010', $1, 'Frappuccino', 'Blended iced coffee with cream', 180.00, 'c1000000-0000-0000-0000-000000000002'),
      ('e1000000-0000-0000-0000-000000000011', $1, 'Matcha Latte', 'Premium matcha with steamed milk', 155.00, 'c1000000-0000-0000-0000-000000000003'),
      ('e1000000-0000-0000-0000-000000000012', $1, 'Hot Chocolate', 'Rich chocolate with steamed milk', 135.00, 'c1000000-0000-0000-0000-000000000003'),
      ('e1000000-0000-0000-0000-000000000013', $1, 'Iced Matcha', 'Matcha over ice with milk', 160.00, 'c1000000-0000-0000-0000-000000000003'),
      ('e1000000-0000-0000-0000-000000000014', $1, 'Butter Croissant', 'Flaky French butter croissant', 85.00, 'c1000000-0000-0000-0000-000000000004'),
      ('e1000000-0000-0000-0000-000000000015', $1, 'Blueberry Muffin', 'Moist muffin with blueberries', 75.00, 'c1000000-0000-0000-0000-000000000004')
      ON CONFLICT DO NOTHING`, [t]);

    // Re-insert seed recipes
    await client.query(`INSERT INTO recipes (product_id, ingredient_id, quantity) VALUES
      ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 18),
      ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000004', 0),
      ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000012', 1),
      ('e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 18),
      ('e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000012', 1),
      ('e1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001', 18),
      ('e1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000002', 120),
      ('e1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000012', 1),
      ('e1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', 18),
      ('e1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000002', 200),
      ('e1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000012', 1),
      ('e1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000001', 18),
      ('e1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000002', 200),
      ('e1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000006', 15),
      ('e1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000007', 15),
      ('e1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000013', 1),
      ('e1000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000001', 18),
      ('e1000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000002', 180),
      ('e1000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000009', 20),
      ('e1000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000013', 1),
      ('e1000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000001', 18),
      ('e1000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000011', 200),
      ('e1000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000013', 1),
      ('e1000000-0000-0000-0000-000000000008', 'd1000000-0000-0000-0000-000000000001', 18),
      ('e1000000-0000-0000-0000-000000000008', 'd1000000-0000-0000-0000-000000000002', 150),
      ('e1000000-0000-0000-0000-000000000008', 'd1000000-0000-0000-0000-000000000011', 150),
      ('e1000000-0000-0000-0000-000000000008', 'd1000000-0000-0000-0000-000000000013', 1),
      ('e1000000-0000-0000-0000-000000000011', 'd1000000-0000-0000-0000-000000000010', 8),
      ('e1000000-0000-0000-0000-000000000011', 'd1000000-0000-0000-0000-000000000002', 200),
      ('e1000000-0000-0000-0000-000000000011', 'd1000000-0000-0000-0000-000000000004', 15),
      ('e1000000-0000-0000-0000-000000000011', 'd1000000-0000-0000-0000-000000000013', 1),
      ('e1000000-0000-0000-0000-000000000012', 'd1000000-0000-0000-0000-000000000009', 25),
      ('e1000000-0000-0000-0000-000000000012', 'd1000000-0000-0000-0000-000000000002', 200),
      ('e1000000-0000-0000-0000-000000000012', 'd1000000-0000-0000-0000-000000000004', 20),
      ('e1000000-0000-0000-0000-000000000012', 'd1000000-0000-0000-0000-000000000012', 1),
      ('e1000000-0000-0000-0000-000000000014', 'd1000000-0000-0000-0000-000000000015', 1),
      ('e1000000-0000-0000-0000-000000000015', 'd1000000-0000-0000-0000-000000000016', 1)
      ON CONFLICT DO NOTHING`);

    // Re-insert seed expenses
    await client.query(`INSERT INTO expenses (tenant_id, category, description, amount, expense_date, recorded_by) VALUES
      ($1, 'rent', 'Monthly shop rent - April 2024', 18000.00, '2024-04-01', 'a1b2c3d4-0000-0000-0000-000000000001'),
      ($1, 'utilities', 'Electricity bill - March 2024', 3250.00, '2024-04-05', 'a1b2c3d4-0000-0000-0000-000000000001'),
      ($1, 'utilities', 'Water bill - March 2024', 850.00, '2024-04-05', 'a1b2c3d4-0000-0000-0000-000000000001'),
      ($1, 'salaries', 'Staff salaries - March 2024', 45000.00, '2024-03-31', 'a1b2c3d4-0000-0000-0000-000000000001'),
      ($1, 'ingredients', 'Espresso beans restock - 5kg', 9500.00, '2024-04-02', 'a1b2c3d4-0000-0000-0000-000000000002'),
      ($1, 'ingredients', 'Milk delivery - week 1 April', 2800.00, '2024-04-01', 'a1b2c3d4-0000-0000-0000-000000000002'),
      ($1, 'ingredients', 'Syrups and powders restock', 3200.00, '2024-04-03', 'a1b2c3d4-0000-0000-0000-000000000002'),
      ($1, 'marketing', 'Social media ads - April', 1500.00, '2024-04-01', 'a1b2c3d4-0000-0000-0000-000000000001'),
      ($1, 'equipment', 'Coffee grinder maintenance', 2500.00, '2024-04-08', 'a1b2c3d4-0000-0000-0000-000000000001')`, [t]);

    await client.query('COMMIT');
    console.log('✅ Demo tenant reset to seed state');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Demo reset error:', err.message);
  } finally {
    client.release();
  }
}

module.exports = { blockDemoWrites, resetDemoTenant, isDemoUser, DEMO_TENANT_ID, DEMO_EMAILS };
