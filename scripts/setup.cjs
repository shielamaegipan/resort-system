const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const backend = path.resolve(__dirname, '../backend');
const envFile = path.join(backend, '.env');

async function main() {
  if (!fs.existsSync(envFile)) {
    const template = fs.readFileSync(path.join(backend, '.env.example'), 'utf8');
    fs.writeFileSync(envFile, template.replace('JWT_SECRET=palitan-mo-ito', `JWT_SECRET=${crypto.randomBytes(32).toString('hex')}`), { flag: 'wx' });
    console.log('Created backend/.env with a unique JWT secret. Existing .env files are preserved.');
  }
  require('../backend/node_modules/dotenv').config({ path: envFile });
  const mysql = require('../backend/node_modules/mysql2/promise');
  const name = process.env.DB_NAME;
  if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) throw new Error('DB_NAME must contain only letters, numbers, or underscores.');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });
  try {
    const schema = fs.readFileSync(path.join(backend, 'schema.sql'), 'utf8')
      .replace(/CREATE DATABASE IF NOT EXISTS resort_system;/, `CREATE DATABASE IF NOT EXISTS \`${name}\`;`)
      .replace(/USE resort_system;/, `USE \`${name}\`;`);
    for (const statement of schema.split(';').map(s => s.trim()).filter(Boolean)) {
      await connection.query(statement);
    }
    console.log('Database tables ready. Run npm run dev from the project root.');
  } finally {
    await connection.end();
  }
}
main().catch(error => {
  console.error(`Setup failed (${error.code || 'configuration'}). Start MySQL and check DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME in backend/.env, then rerun npm run setup.`);
  process.exitCode = 1;
});
