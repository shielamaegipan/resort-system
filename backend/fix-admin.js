const mysql = require('mysql2/promise');
let bcrypt;
try { bcrypt = require('bcryptjs'); } catch { bcrypt = require('bcrypt'); }

(async () => {
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
  const hash = await bcrypt.hash('admin1234567', 10);
  const [r] = await conn.query(
    `UPDATE users SET role='admin', ${pwCol}=?, deleted_at=NULL WHERE email='admin@resort.com'`,
    [hash]
  );
  console.log('updated rows:', r.affectedRows);
  await conn.end();
})().catch((e) => { console.error(e.message); process.exit(1); });