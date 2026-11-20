const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: 'hopper.proxy.rlwy.net',
    port: 54170,
    user: 'root',
    password: process.env.DBPASS,
    database: 'resort_system',
  });
  const [r] = await conn.query(
    "UPDATE users SET role='admin' WHERE email=? AND deleted_at IS NULL",
    [process.argv[2]]
  );
  console.log('updated rows:', r.affectedRows);
  await conn.end();
})().catch((e) => { console.error(e.message); process.exit(1); });  