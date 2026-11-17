// Uses a new database only; never resets or drops application data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const backend = createRequire(path.resolve(__dirname, '../backend/package.json'));
backend('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
const mysql = backend('mysql2/promise');

async function main() {
  const database = `resort_payment_migration_verify_${Date.now()}`;
  let connection, pool;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST, user: process.env.DB_USER,
      password: process.env.DB_PASSWORD, multipleStatements: true, dateStrings: true,
    });
    await connection.query(fs.readFileSync(path.resolve(__dirname, '../backend/schema.sql'), 'utf8').replaceAll('resort_system', database));
    await connection.query("INSERT INTO users(id,name,email,password_hash,role) VALUES(1,'Legacy staff','legacy@example.test','test-hash','staff')");
    await connection.query("INSERT INTO rooms(id,name,price_per_night) VALUES(1,'Legacy room',1000)");
    await connection.query("INSERT INTO bookings(id,user_id,room_id,guest_name,check_in,check_out,total_price) VALUES(1,1,1,'Legacy guest','2026-12-01','2026-12-02',1000)");
    await connection.query("INSERT INTO payments(id,booking_id,amount,note,received_by,created_at) VALUES(1,1,250.50,'Historical cash receipt',1,'2026-11-01 12:00:00')");
    process.env.DB_NAME = database;
    pool = require('../backend/db');
    const migrate = require('../backend/migrate-platform');
    await migrate();
    const [[first]] = await pool.query('SELECT * FROM payments WHERE id=1');
    assert.equal(Number(first.amount), 250.50);
    assert.equal(first.note, 'Historical cash receipt');
    assert.equal(first.notes, first.note);
    assert.equal(first.recorded_by, 1);
    assert.equal(first.received_by, 1);
    assert.equal(first.verified_by, 1);
    assert.equal(first.status, 'verified');
    assert.equal(first.verified_at, first.created_at);
    await migrate();
    const [[repeated]] = await pool.query('SELECT * FROM payments WHERE id=1');
    assert.deepEqual(repeated, first, 'Repeated migration must preserve historical payment values');
    await pool.query("INSERT INTO payments(booking_id,amount,method,status,recorded_by,idempotency_key,request_hash) VALUES(1,100,'cash','pending',1,'new-payment',?)", ['a'.repeat(64)]);
    const [[created]] = await pool.query("SELECT * FROM payments WHERE idempotency_key='new-payment'");
    assert.equal(created.received_by, null);
    assert.equal(created.recorded_by, 1);
    assert.equal(created.status, 'pending');
    await assert.rejects(pool.query("INSERT INTO payments(booking_id,amount,method,status,recorded_by,idempotency_key,request_hash) VALUES(1,100,'cash','pending',1,'new-payment',?)", ['a'.repeat(64)]), error => error.code === 'ER_DUP_ENTRY');
    console.log(`PASS legacy cash history, migration idempotency, new payment writes, and unique retry keys (${database})`);
  } finally {
    if (pool) await pool.end();
    if (connection) await connection.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
