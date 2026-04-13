// db/pool.js
// PostgreSQL connection pool using pg (node-postgres)
// All queries go through this pool — do NOT create new Pool instances elsewhere.

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'brewpos',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  // Keep connections alive and limit pool size
  max: parseInt(process.env.DB_POOL_MAX) || 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // For Supabase/SSL connections, uncomment:
  // ssl: { rejectUnauthorized: false }
});

// Test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌  Database connection failed:', err.message);
  } else {
    console.log('✅  PostgreSQL connected:', process.env.DB_NAME);
    release();
  }
});

module.exports = pool;
