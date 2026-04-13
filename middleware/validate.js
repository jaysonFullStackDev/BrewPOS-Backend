// middleware/validate.js
// Input validation rules using express-validator

const { body, validationResult } = require('express-validator');

// Matches any UUID-shaped string (8-4-4-4-12 hex)
const isUUIDLike = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// Runs after validation rules — returns 400 if any failed
const handleErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: errors.array().map(e => e.msg).join(', '),
    });
  }
  next();
};

// ── Auth ──────────────────────────────────────────────────
const loginRules = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  handleErrors,
];

const createUserRules = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain a lowercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain a special character'),
  body('role').isIn(['admin', 'manager', 'cashier']).withMessage('Invalid role'),
  handleErrors,
];

const changePasswordRules = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain a lowercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain a special character'),
  handleErrors,
];

// ── Products ──────────────────────────────────────────────
const createProductRules = [
  body('name').trim().notEmpty().withMessage('Product name is required').isLength({ max: 150 }),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('category_id').optional().custom(isUUIDLike).withMessage('Invalid category ID'),
  body('recipe').optional().isArray(),
  body('recipe.*.ingredient_id').optional().custom(isUUIDLike).withMessage('Invalid ingredient ID in recipe'),
  body('recipe.*.quantity').optional().isFloat({ min: 0.001 }).withMessage('Recipe quantity must be positive'),
  handleErrors,
];

const updateProductRules = [
  body('name').trim().notEmpty().withMessage('Product name is required').isLength({ max: 150 }),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('category_id').optional().custom(isUUIDLike).withMessage('Invalid category ID'),
  body('is_available').optional().isBoolean().withMessage('is_available must be boolean'),
  handleErrors,
];

// ── Sales ─────────────────────────────────────────────────
const processSaleRules = [
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product_id').custom(isUUIDLike).withMessage('Invalid product ID'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('payment_method').isIn(['cash', 'card', 'ewallet', 'gcash', 'maya', 'gotyme', 'bank_transfer']).withMessage('Invalid payment method'),
  body('discount').optional().isFloat({ min: 0 }).withMessage('Discount must be non-negative'),
  body('amount_tendered').optional().isFloat({ min: 0 }).withMessage('Amount tendered must be non-negative'),
  body('notes').optional().trim().isLength({ max: 500 }),
  handleErrors,
];

// ── Inventory ─────────────────────────────────────────────
const createIngredientRules = [
  body('name').trim().notEmpty().withMessage('Ingredient name is required').isLength({ max: 150 }),
  body('unit').trim().notEmpty().withMessage('Unit is required').isLength({ max: 20 }),
  body('stock_qty').optional().isFloat({ min: 0 }).withMessage('Stock must be non-negative'),
  body('low_stock_alert').optional().isFloat({ min: 0 }),
  body('cost_per_unit').optional().isFloat({ min: 0 }),
  body('supplier_id').optional({ nullable: true }).custom(isUUIDLike).withMessage('Invalid supplier ID'),
  handleErrors,
];

const stockMovementRules = [
  body('ingredient_id').custom(isUUIDLike).withMessage('Invalid ingredient ID'),
  body('movement_type').isIn(['purchase', 'wastage', 'adjustment']).withMessage('Invalid movement type'),
  body('quantity_change').isFloat().withMessage('Quantity must be a number').not().equals('0').withMessage('Quantity cannot be zero'),
  body('notes').optional().trim().isLength({ max: 500 }),
  handleErrors,
];

const createSupplierRules = [
  body('name').trim().notEmpty().withMessage('Supplier name is required').isLength({ max: 150 }),
  body('email').optional({ nullable: true }).isEmail().withMessage('Invalid email'),
  body('phone').optional().trim().isLength({ max: 30 }),
  handleErrors,
];

// ── Accounting ────────────────────────────────────────────
const createExpenseRules = [
  body('category').isIn(['ingredients', 'utilities', 'salaries', 'rent', 'equipment', 'marketing', 'other'])
    .withMessage('Invalid expense category'),
  body('description').trim().notEmpty().withMessage('Description is required').isLength({ max: 500 }),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
  body('expense_date').optional().isISO8601().withMessage('Invalid date format'),
  handleErrors,
];

// ── Orders ────────────────────────────────────────────────
const updateOrderStatusRules = [
  body('status').isIn(['pending', 'preparing', 'ready', 'completed']).withMessage('Invalid order status'),
  handleErrors,
];

module.exports = {
  loginRules,
  createUserRules,
  changePasswordRules,
  createProductRules,
  updateProductRules,
  processSaleRules,
  createIngredientRules,
  stockMovementRules,
  createSupplierRules,
  createExpenseRules,
  updateOrderStatusRules,
};
