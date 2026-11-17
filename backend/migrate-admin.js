const db = require('./db');

// Additive and idempotent: no existing rows or prices are rewritten.
async function migrate() {
  const [tables] = await db.query("SHOW TABLE STATUS WHERE Name IN ('rooms','bookings','users')");
  if (tables.length !== 3 || tables.some((table) => table.Engine !== 'InnoDB')) throw new Error('Rooms, bookings, and users must exist and use InnoDB for safe booking transactions. Apply schema.sql to a new database or review a safe engine migration for existing tables.');
  for (const [column, definition] of [['image_url', 'VARCHAR(255) NULL'], ['amenities', 'TEXT NULL']]) {
    const [columns] = await db.query('SHOW COLUMNS FROM rooms LIKE ?', [column]);
    if (!columns.length) await db.query(`ALTER TABLE rooms ADD COLUMN ${column} ${definition}`);
  }
  await db.query(`CREATE TABLE IF NOT EXISTS admin_notifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id CHAR(36) NOT NULL,
    user_id INT NOT NULL,
    category VARCHAR(20) NOT NULL,
    title VARCHAR(150) NOT NULL,
    body VARCHAR(500) NOT NULL,
    entity_id INT NULL,
    read_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY notification_recipient (event_id, user_id),
    KEY notification_inbox (user_id, read_at, id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  ) ENGINE=InnoDB`);
  const [indexes] = await db.query("SHOW INDEX FROM bookings WHERE Key_name = 'booking_availability'");
  if (!indexes.length) await db.query('CREATE INDEX booking_availability ON bookings (room_id, deleted_at, status, check_in, check_out)');
}
if (require.main === module) migrate().then(() => console.log('Admin migration complete')).catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => db.end());
module.exports = migrate;
