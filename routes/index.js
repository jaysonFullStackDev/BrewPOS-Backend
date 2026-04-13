// routes/index.js
// Centralises all route definitions

const express = require('express');
const router  = express.Router();

const { authenticate, authorize } = require('../middleware/auth');
const { loginLimiter, apiLimiter } = require('../middleware/rateLimiter');
const v = require('../middleware/validate');
const audit = require('../middleware/auditLog');
const { checkAccountLockout } = require('../middleware/security');

// Controllers
const authCtrl      = require('../controllers/authController');
const productsCtrl  = require('../controllers/productsController');
const salesCtrl     = require('../controllers/salesController');
const ordersCtrl    = require('../controllers/ordersController');
const inventoryCtrl = require('../controllers/inventoryController');
const accountingCtrl= require('../controllers/accountingController');
const reportsCtrl   = require('../controllers/reportsController');
const auditCtrl     = require('../controllers/auditController');

// ── Global rate limit on all API routes ───────────────────
router.use(apiLimiter);

// ── Auth ──────────────────────────────────────────────────
router.post('/auth/login',    loginLimiter, checkAccountLockout, v.loginRules, audit('login', 'auth'), authCtrl.login);
router.post('/auth/google',   loginLimiter, authCtrl.googleAuth);
router.post('/auth/refresh',  loginLimiter, authCtrl.refresh);
router.post('/auth/logout',   authCtrl.logout);
router.get ('/auth/me',       authenticate, authCtrl.getMe);
router.get ('/auth/tenant',   authenticate, authCtrl.getTenant);
router.put ('/auth/tenant-setup', authenticate, authorize('admin'), authCtrl.tenantSetup);
router.get ('/auth/users',    authenticate, authorize('admin','manager'), authCtrl.getUsers);
router.post('/auth/users',    authenticate, authorize('admin'), v.createUserRules, audit('create_user', 'user'), authCtrl.createUser);
router.put ('/auth/change-password', authenticate, v.changePasswordRules, audit('change_password', 'user'), authCtrl.changePassword);

// ── Products ──────────────────────────────────────────────
router.get ('/products',      authenticate, productsCtrl.getProducts);
router.get ('/products/:id',  authenticate, productsCtrl.getProduct);
router.post('/products',      authenticate, authorize('admin','manager'), v.createProductRules, audit('create_product', 'product'), productsCtrl.createProduct);
router.put ('/products/:id',  authenticate, authorize('admin','manager'), v.updateProductRules, audit('update_product', 'product'), productsCtrl.updateProduct);
router.delete('/products/:id',authenticate, authorize('admin'), audit('delete_product', 'product'), productsCtrl.deleteProduct);
router.get ('/categories',    authenticate, productsCtrl.getCategories);
router.post('/categories',    authenticate, authorize('admin','manager'), audit('create_category', 'category'), productsCtrl.createCategory);

// ── Sales / POS ───────────────────────────────────────────
router.post('/sales',         authenticate, v.processSaleRules, audit('create_sale', 'sale'), salesCtrl.processSale);
router.get ('/sales',         authenticate, salesCtrl.getSales);
router.get ('/sales/:id',     authenticate, salesCtrl.getSale);

// ── Kitchen / Orders ──────────────────────────────────────
router.get  ('/orders/active',      authenticate, ordersCtrl.getActiveOrders);
router.patch('/orders/:id/status',  authenticate, v.updateOrderStatusRules, audit('update_order_status', 'order'), ordersCtrl.updateOrderStatus);

// ── Inventory ─────────────────────────────────────────────
router.get ('/inventory/ingredients',      authenticate, inventoryCtrl.getIngredients);
router.post('/inventory/ingredients',      authenticate, authorize('admin','manager'), v.createIngredientRules, audit('create_ingredient', 'ingredient'), inventoryCtrl.createIngredient);
router.put ('/inventory/ingredients/:id',  authenticate, authorize('admin','manager'), v.createIngredientRules, audit('update_ingredient', 'ingredient'), inventoryCtrl.updateIngredient);
router.get ('/inventory/low-stock',        authenticate, inventoryCtrl.getLowStockAlerts);
router.post('/inventory/stock-movement',   authenticate, authorize('admin','manager'), v.stockMovementRules, audit('stock_movement', 'inventory'), inventoryCtrl.addStockMovement);
router.get ('/inventory/movements',        authenticate, inventoryCtrl.getStockMovements);
router.get ('/inventory/suppliers',        authenticate, inventoryCtrl.getSuppliers);
router.post('/inventory/suppliers',        authenticate, authorize('admin','manager'), v.createSupplierRules, audit('create_supplier', 'supplier'), inventoryCtrl.createSupplier);

// ── Accounting ────────────────────────────────────────────
router.post('/accounting/expenses',        authenticate, authorize('admin','manager'), v.createExpenseRules, audit('create_expense', 'expense'), accountingCtrl.createExpense);
router.get ('/accounting/expenses',        authenticate, authorize('admin','manager'), accountingCtrl.getExpenses);
router.get ('/accounting/pnl',             authenticate, authorize('admin','manager'), accountingCtrl.getProfitAndLoss);
router.get ('/accounting/cashflow',        authenticate, authorize('admin','manager'), accountingCtrl.getCashFlow);

// ── Audit Logs ────────────────────────────────────────────
router.get ('/audit/logs',    authenticate, authorize('admin'), auditCtrl.getLogs);

// ── Reports ───────────────────────────────────────────────
router.get ('/reports/sales-summary',      authenticate, reportsCtrl.getSalesSummary);
router.get ('/reports/top-products',       authenticate, reportsCtrl.getTopProducts);
router.get ('/reports/inventory-usage',    authenticate, reportsCtrl.getInventoryUsage);
router.get ('/reports/dashboard',          authenticate, reportsCtrl.getDashboardStats);

module.exports = router;
