const db=require('./db');
async function migrate(){
  const add=async(table,name,definition)=>{const [rows]=await db.query(`SHOW COLUMNS FROM ${table} LIKE ?`,[name]);if(!rows.length)await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);};
  await add('rooms','room_number','VARCHAR(30) NULL');
  const [indexes]=await db.query("SHOW INDEX FROM rooms WHERE Key_name='unique_room_number'");
  if(!indexes.length)await db.query('CREATE UNIQUE INDEX unique_room_number ON rooms(room_number)');
  const [[status]]=await db.query("SHOW COLUMNS FROM bookings LIKE 'status'");
  if(!status.Type.includes('no_show'))await db.query("ALTER TABLE bookings MODIFY status ENUM('pending','confirmed','checked_in','checked_out','cancelled','no_show') NOT NULL DEFAULT 'pending'");
  await add('users','phone','VARCHAR(80) NULL');
  await add('maintenance_records','workflow_status',"ENUM('pending','in_progress','completed','cancelled') NULL");
  await add('maintenance_records','priority',"ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal'");
  await add('maintenance_records','updated_at','TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  const columns=[['description','TEXT NULL'],['address','VARCHAR(500) NULL'],['check_in_time',"VARCHAR(5) NOT NULL DEFAULT '14:00'"],['check_out_time',"VARCHAR(5) NOT NULL DEFAULT '12:00'"],['booking_policy','TEXT NULL'],['cancellation_policy','TEXT NULL'],['currency',"VARCHAR(3) NOT NULL DEFAULT 'PHP'"],['currency_display',"VARCHAR(10) NOT NULL DEFAULT 'symbol'"],['notification_preferences','TEXT NULL']];
  for(const [name,definition]of columns)await add('resort_settings',name,definition);
  await db.query(`CREATE TABLE IF NOT EXISTS maintenance_history(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,maintenance_id INT NOT NULL,actor_id INT NOT NULL,action VARCHAR(40) NOT NULL,details TEXT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,KEY(maintenance_id,id),FOREIGN KEY(maintenance_id) REFERENCES maintenance_records(id),FOREIGN KEY(actor_id) REFERENCES users(id)) ENGINE=InnoDB`);
  const grants={super_admin:['guests.view','guests.manage'],admin:['guests.view','guests.manage'],receptionist:['guests.view','guests.manage']};
  for(const [role,list]of Object.entries(grants))for(const permission of list)await db.query('INSERT IGNORE INTO role_permissions(role_code,permission) VALUES (?,?)',[role,permission]);
  await db.query("INSERT IGNORE INTO permission_roles(code,label) VALUES ('operational_staff','Staff')");
  for(const permission of ['rooms.view','rooms.operation','maintenance.manage'])await db.query('INSERT IGNORE INTO role_permissions(role_code,permission) VALUES (?,?)',['operational_staff',permission]);
}
module.exports=migrate;
if(require.main===module)migrate().then(()=>console.log('Advanced migration complete')).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.end());
