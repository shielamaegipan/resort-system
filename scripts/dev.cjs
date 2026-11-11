const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend');
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
function launch(file, args, cwd, env) {
  const child = spawn(process.execPath, [file, ...args], { cwd, env, stdio: 'inherit' });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 0); });
}
async function main() {
  if (!fs.existsSync(path.join(backend, '.env'))) throw new Error('Missing backend/.env. Run npm run setup first.');
  require('../backend/node_modules/dotenv').config({ path: path.join(backend, '.env') });
  const port = Number(process.env.PORT || 4000);
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(new Error(`Backend port ${port} is already in use. Stop the old backend or change PORT in backend/.env.`)));
    probe.listen(port, () => probe.close(resolve));
  });
  const db = require('../backend/db');
  try { await db.query('SELECT id FROM users LIMIT 1'); }
  catch (error) { throw new Error(`Database is not ready (${error.code || 'configuration'}). Start MySQL, check backend/.env, then run npm run setup.`); }
  finally { await db.end(); }
  launch('server.js', [], backend, process.env);
  launch('node_modules/vite/bin/vite.js', ['--host', 'localhost'], path.join(root, 'frontend'), {
    ...process.env, API_PROXY_TARGET: `http://localhost:${port}`,
  });
  console.log('Open the Local URL printed by Vite below. If 5173 is busy, Vite chooses another port. Keep this terminal open; Ctrl+C stops both servers.');
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
main().catch(error => { console.error(error.message); stop(1); });
