// db/setup.js
// One-step database setup — no psql needed
// Run with: node db/setup.js

require('dotenv').config();
const fs     = require('fs');
const path   = require('path');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const DB_NAME = process.env.DB_NAME || 'brewpos';

const baseConfig = {
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
};

async function run() {
  // 1. Create database (connect to 'postgres' default db)
  const admin = new Client({ ...baseConfig, database: 'postgres' });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB_NAME]);
  if (exists.rows.length === 0) {
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    console.log(`✅  Database "${DB_NAME}" created`);
  } else {
    console.log(`ℹ️  Database "${DB_NAME}" already exists`);
  }
  await admin.end();

  // 2. Run schema + seed
  const app = new Client({ ...baseConfig, database: DB_NAME });
  await app.connect();

  const schemaSQL = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  await app.query(schemaSQL);
  console.log('✅  Schema applied');

  const seedSQL = fs.readFileSync(path.join(__dirname, '..', 'database', 'seed.sql'), 'utf8');
  await app.query(seedSQL);
  console.log('✅  Seed data inserted');

  // 3. Hash seed passwords
  const users = [
    { email: 'admin@brewpos.com',   password: 'Admin@123' },
    { email: 'manager@brewpos.com', password: 'Manager@123' },
    { email: 'cashier@brewpos.com', password: 'Cashier@123' },
  ];
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await app.query('UPDATE users SET password = $1 WHERE email = $2', [hash, u.email]);
    console.log(`✅  Hashed password for ${u.email}`);
  }

  await app.end();
  console.log('\n🎉  Database setup complete! You can now run: npm run dev');
  process.exit(0);
}

run().catch(err => {
  console.error('❌  Setup failed:', err.message);
  process.exit(1);
});
