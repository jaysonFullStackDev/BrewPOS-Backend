// db/hash-seed-passwords.js
// Run with: node db/hash-seed-passwords.js
// Hashes seed passwords only if they haven't been hashed yet.

const bcrypt = require('bcryptjs');
const pool   = require('./pool');

const SALT_ROUNDS = 10;

const users = [
  { email: 'admin@brewpos.com',   password: 'Admin@123' },
  { email: 'manager@brewpos.com', password: 'Manager@123' },
  { email: 'cashier@brewpos.com', password: 'Cashier@123' },
];

async function hashAndUpdate() {
  let updated = 0;

  for (const user of users) {
    const result = await pool.query(
      'SELECT password FROM users WHERE email = $1',
      [user.email]
    );
    if (result.rows.length === 0) continue;

    // Skip if already a valid bcrypt hash (60 chars, starts with $2)
    if (result.rows[0].password.startsWith('$2') && result.rows[0].password.length === 60) continue;

    const hash = await bcrypt.hash(user.password, SALT_ROUNDS);
    await pool.query(
      'UPDATE users SET password = $1 WHERE email = $2',
      [hash, user.email]
    );
    console.log(`🔐  Hashed password for ${user.email}`);
    updated++;
  }

  if (updated === 0) console.log('🔐  Seed passwords already hashed — skipped.');
  process.exit(0);
}

hashAndUpdate().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
