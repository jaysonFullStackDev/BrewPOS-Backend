# ☕ BrewPOS Backend

REST API + WebSocket server for the [BrewPOS](https://github.com/jaysonFullStackDev/POS) coffee shop POS system.

### 🔗 [Frontend Repo](https://github.com/jaysonFullStackDev/POS) · [Live Demo](https://brewpos.vercel.app)

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ · Express.js |
| Database | PostgreSQL (Supabase) · pg connection pool (50 max) |
| Real-time | Socket.IO (JWT-authenticated, tenant-scoped rooms) |
| Auth | JWT access tokens + refresh token rotation · Google OAuth 2.0 |
| Security | Helmet · express-rate-limit · express-validator · bcryptjs |
| Testing | Jest · Supertest · ESLint |
| Deploy | Render (free tier) · GitHub Actions CI/CD |

---

## 🔒 Security Features

- **Rate limiting** — 5 login attempts/15min, 100 requests/min per IP
- **Input validation** — express-validator on all 13+ mutation endpoints
- **Input sanitization** — Strips HTML/script tags from all string inputs
- **Helmet.js** — Secure HTTP headers
- **Account lockout** — Locks after 5 failed login attempts (15min cooldown)
- **Refresh token rotation** — Reuse detection revokes entire token family
- **Row-level locking** — `SELECT FOR UPDATE` prevents inventory race conditions
- **DB constraint** — `CHECK (stock_qty >= 0)` prevents overselling
- **Audit logging** — Every mutation logged with user, action, details, IP
- **Demo guard** — Demo accounts can only create sales, not modify data

---

## 📡 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | — | Email/password login |
| POST | `/api/auth/google` | — | Google OAuth login/signup |
| POST | `/api/auth/refresh` | — | Refresh access token |
| GET | `/api/auth/me` | ✅ | Current user profile |
| GET | `/api/products` | ✅ | List products (cached) |
| POST | `/api/products` | Admin/Manager | Create product |
| POST | `/api/sales` | ✅ | Process sale (deducts inventory) |
| GET | `/api/orders/active` | ✅ | Kitchen display orders |
| PATCH | `/api/orders/:id/status` | ✅ | Update order status |
| GET | `/api/inventory/ingredients` | ✅ | List ingredients |
| POST | `/api/inventory/stock-movement` | Admin/Manager | Record stock change |
| GET | `/api/reports/dashboard` | ✅ | Dashboard stats |
| GET | `/api/accounting/pnl` | Admin/Manager | Profit & Loss report |
| GET | `/api/audit/logs` | Admin | Audit log viewer |

---

## 🧪 Testing

```bash
# Run all tests (21 tests)
npm test

# Run linter
npm run lint
```

### Test Coverage
| Suite | Tests | What's covered |
|-------|-------|---------------|
| health.test.js | 2 | Health endpoint, 404 handler |
| validate.test.js | 10 | Login rules, sale rules, expense rules |
| security.test.js | 9 | XSS sanitization, account lockout |

### CI/CD Pipeline
```
Push → ESLint → Jest (Node 18 + 20) → Deploy to Render
```

---

## 🚀 Setup

### Prerequisites
- Node.js v18+
- PostgreSQL (or Supabase)

### Install & Run

```bash
npm install
cp .env.example .env
```

Edit `.env`:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=brewpos
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
GOOGLE_CLIENT_ID=your-google-client-id
ALLOWED_ORIGINS=http://localhost:3000
```

### Database Setup

```bash
psql -U postgres -c "CREATE DATABASE brewpos;"
psql -U postgres -d brewpos -f database/schema.sql
psql -U postgres -d brewpos -f database/seed.sql
```

### Start Server

```bash
npm run dev
# → ☕ BrewPOS API running on http://localhost:4000
```

---

## 📁 Project Structure

```
├── controllers/        - Route handlers (auth, sales, orders, inventory, etc.)
├── middleware/
│   ├── auth.js         - JWT authentication + role authorization + demo guard
│   ├── validate.js     - Input validation rules (express-validator)
│   ├── rateLimiter.js  - Rate limiting (login + API)
│   ├── auditLog.js     - Auto-logging middleware
│   └── security.js     - Input sanitization + account lockout
├── routes/index.js     - All route definitions
├── db/pool.js          - PostgreSQL connection pool
├── database/
│   ├── schema.sql      - Full multi-tenant schema
│   ├── seed.sql        - Demo tenant with sample data
│   └── migration-*.sql - Incremental migrations
├── tests/              - Jest + Supertest tests
├── server.js           - Express + Socket.IO entry point
└── eslint.config.js    - ESLint flat config
```

---

## 📄 License

MIT

---

Built with ☕ by [Jayson](https://github.com/jaysonFullStackDev)
