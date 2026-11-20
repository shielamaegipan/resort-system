const mysql = require('mysql2/promise');
let bcrypt;
try { bcrypt = require('bcryptjs'); } catch { bcrypt = require('bcrypt'); }

(async () => {
  const [email, password, name, role] = process.argv.slice(2);
  if (!email || !password) throw new Error('Usage: node create-admin.js email password "Name" admin|staff');
  const conn = await mysql.createConnection({
    host: 'hopper.proxy.rlwy.net',
    port: 54170,
    user: 'root',
    password: process.env.DBPASS,
    database: 'resort_system',
  });
  const [cols] = await conn.query('SHOW COLUMNS FROM users');
  const names = cols.map((c) => c.Field);
  const pwCol = names.includes('password_hash') ? 'password_hash' : 'password';
  const hash = await bcrypt.hash(password, 10);
  await conn.query(
    `INSERT INTO users (name, email, ${pwCol}, role) VALUES (?, ?, ?, ?)`,
    [name || 'Admin', email, hash, role || 'admin']
  );
  console.log('created', email, 'as', role || 'admin');
  await conn.end();
})().catch((e) => { console.error(e.message); process.exit(1); });