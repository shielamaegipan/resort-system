const db = require('./db');
async function migrate() {
  const add = async (table, name, definition) => {
    const [rows] = await db.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [name]);
    if (!rows.length) await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  await add('users', 'permission_role', "VARCHAR(30) NULL");
  await add('users', 'last_login_at', 'DATETIME NULL');
  await add('users', 'token_version', 'INT NOT NULL DEFAULT 0');
  await add('bookings', 'special_requests', 'TEXT NULL');
  await add('bookings', 'checked_in_at', 'DATETIME NULL');
  await add('bookings', 'checked_out_at', 'DATETIME NULL');
  await add('bookings', 'checked_in_by', 'INT NULL');
  await add('bookings', 'checked_out_by', 'INT NULL');
  const [[status]] = await db.query("SHOW COLUMNS FROM rooms LIKE 'status'");
  if (!status.Type.includes('out_of_service')) await db.query("ALTER TABLE rooms MODIFY status ENUM('available','occupied','cleaning','maintenance','out_of_service') NOT NULL DEFAULT 'available'");
  const definitions = [
    `CREATE TABLE IF NOT EXISTS permission_roles (code VARCHAR(30) PRIMARY KEY, label VARCHAR(60) NOT NULL) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS role_permissions (role_code VARCHAR(30) NOT NULL, permission VARCHAR(60) NOT NULL, PRIMARY KEY(role_code,permission), FOREIGN KEY(role_code) REFERENCES permission_roles(code)) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS activity_logs (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, actor_id INT NULL, entity_type VARCHAR(30) NOT NULL, entity_id INT NULL, action VARCHAR(60) NOT NULL, details TEXT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY activity_entity(entity_type,entity_id,id), FOREIGN KEY(actor_id) REFERENCES users(id)) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS room_images (id INT AUTO_INCREMENT PRIMARY KEY, room_id INT NOT NULL, url VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY(room_id), FOREIGN KEY(room_id) REFERENCES rooms(id)) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS payments (id INT AUTO_INCREMENT PRIMARY KEY, booking_id INT NOT NULL, amount DECIMAL(10,2) NOT NULL, method ENUM('cash','gcash','maya','bank_transfer') NOT NULL, status ENUM('pending','submitted','verified','rejected','refunded','partially_refunded') NOT NULL, transaction_reference VARCHAR(150) NULL, notes TEXT NULL, evidence_file VARCHAR(255) NULL, recorded_by INT NOT NULL, verified_by INT NULL, verified_at DATETIME NULL, refunded_amount DECIMAL(10,2) NOT NULL DEFAULT 0, idempotency_key VARCHAR(100) NOT NULL UNIQUE, request_hash CHAR(64) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY(booking_id,status), FOREIGN KEY(booking_id) REFERENCES bookings(id), FOREIGN KEY(recorded_by) REFERENCES users(id), FOREIGN KEY(verified_by) REFERENCES users(id)) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS payment_operations (id INT AUTO_INCREMENT PRIMARY KEY, payment_id INT NOT NULL, operation VARCHAR(30) NOT NULL, amount DECIMAL(10,2) NULL, reason VARCHAR(1000) NULL, actor_id INT NOT NULL, idempotency_key VARCHAR(100) NOT NULL UNIQUE, request_hash CHAR(64) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(payment_id) REFERENCES payments(id), FOREIGN KEY(actor_id) REFERENCES users(id)) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS maintenance_records (id INT AUTO_INCREMENT PRIMARY KEY, room_id INT NOT NULL, assigned_to INT NULL, description VARCHAR(1000) NOT NULL, status ENUM('open','resolved') NOT NULL DEFAULT 'open', created_by INT NOT NULL, resolved_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, resolved_at DATETIME NULL, FOREIGN KEY(room_id) REFERENCES rooms(id), FOREIGN KEY(assigned_to) REFERENCES users(id), FOREIGN KEY(created_by) REFERENCES users(id)) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS resort_settings (id INT PRIMARY KEY, name VARCHAR(150) NOT NULL DEFAULT 'Resort', contact VARCHAR(500) NOT NULL DEFAULT '') ENGINE=InnoDB`
  ];
  for (const sql of definitions) await db.query(sql);
  const [indexes]=await db.query("SHOW INDEX FROM payments WHERE Key_name='payment_provider_reference'");
  if(!indexes.length)await db.query('CREATE UNIQUE INDEX payment_provider_reference ON payments(method,transaction_reference)');
  await db.query('INSERT IGNORE INTO resort_settings(id) VALUES (1)');
  const { profiles } = require('./lib/permissions');
  for (const [code, permissions] of Object.entries(profiles)) {
    await db.query('INSERT IGNORE INTO permission_roles(code,label) VALUES (?,?)', [code, code.replaceAll('_', ' ')]);
    for (const permission of permissions) await db.query('INSERT IGNORE INTO role_permissions(role_code,permission) VALUES (?,?)', [code, permission]);
  }
}
if (require.main === module) migrate().then(() => console.log('Platform migration complete')).catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.end());
module.exports = migrate;
