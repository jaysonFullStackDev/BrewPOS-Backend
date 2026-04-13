# ☕ BrewPOS Backend

Express.js REST API for the BrewPOS coffee shop POS system.

## Setup

```bash
npm install
cp .env.example .env
# Set DB credentials, JWT_SECRET, GOOGLE_CLIENT_ID

# Database setup
psql -U postgres -c "CREATE DATABASE brewpos;"
psql -U postgres -d brewpos -f database/schema.sql
psql -U postgres -d brewpos -f database/seed.sql

# Start server (hashes seed passwords automatically)
npm run dev
```

## Tech Stack
- Node.js · Express.js
- PostgreSQL (via pg pool)
- JWT + Refresh Token Rotation
- Google OAuth 2.0 verification
- bcryptjs · Helmet · compression · express-rate-limit

## Database
The `database/` folder contains:
- `schema.sql` — Full multi-tenant schema
- `seed.sql` — Demo tenant with sample data
- `migration-*.sql` — Incremental migrations
