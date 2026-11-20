const fs = require('fs');
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'hopper.proxy.rlwy.net',
    port: 54170,
    user: 'root',
    password: process.env.DBPASS,
    database: 'resort_system',
    multipleStatements: true,
  });
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node import-sql.js file.sql');
  await conn.query(fs.readFileSync(file, 'utf8'));
  const [rows] = await conn.query('SELECT id, name FROM rooms');
  console.log(rows);
  await conn.end();
})().catch((e) => { console.error(e.message); process.exit(1); });