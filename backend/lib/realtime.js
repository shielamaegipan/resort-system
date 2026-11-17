const { randomUUID } = require('crypto');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { permissions } = require('./permissions');
let namespace;
let root;
let notifications;
function attach(io) {
  root = io;
  notifications = io.of('/notifications');
  notifications.use(async (socket, next) => {
    try {
      const token = verifyToken(socket.handshake.auth.token);
      const [[user]] = await db.query('SELECT id,token_version FROM users WHERE id=? AND deleted_at IS NULL', [token.id]);
      if (!user || (token.version || 0) !== user.token_version) return next(new Error('Unauthorized'));
      socket.data.userId = user.id;
      socket.data.expires = token.exp * 1000;
      next();
    } catch { next(new Error('Unauthorized')); }
  });
  notifications.on('connection', socket => {
    socket.join(`user:${socket.data.userId}`);
    const timer = setTimeout(() => socket.disconnect(true), Math.max(0, socket.data.expires - Date.now()));
    socket.on('disconnect', () => clearTimeout(timer));
  });
  namespace = io.of('/admin');
  namespace.use(async (socket, next) => {
    try {
      const user = verifyToken(socket.handshake.auth.token);
      const [[row]] = await db.query("SELECT * FROM users WHERE id = ? AND role <> 'guest' AND deleted_at IS NULL", [user.id]);
      if (!row) return next(new Error('Admin access required'));
      if((user.version||0)!==row.token_version)return next(new Error('Access changed'));
      socket.data.userId = user.id;
      socket.data.expires = user.exp * 1000;
      next();
    } catch { next(new Error('Unauthorized')); }
  });
  namespace.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);
    const timeout = setTimeout(() => socket.disconnect(true), Math.max(0, socket.data.expires - Date.now()));
    socket.on('disconnect', () => clearTimeout(timeout));
  });
}
async function publish(category, title, body, entityId, eventId) {
  const event = { id: eventId || randomUUID(), category, title, body: String(body).slice(0, 500), entityId: Number(entityId) || null };
  const delivered=[];
  const [[settings]]=await db.query('SELECT notification_preferences FROM resort_settings WHERE id=1');
  let preferences = {};
  try { preferences = settings?.notification_preferences ? JSON.parse(settings.notification_preferences) : {}; }
  catch { console.warn('Invalid notification preferences; using defaults'); }
  try {
    const [users]=await db.query("SELECT * FROM users WHERE role<>'guest' AND deleted_at IS NULL");
    const permission={rooms:'rooms.view',bookings:'bookings.view',users:'staff.manage',payments:'payments.view',guests:'guests.view',settings:'settings.view'}[category];
    for(const user of users){if(!(await permissions(user)).includes(permission))continue;
      if(preferences[category]===false){delivered.push(user.id);continue;}
      const [result]=await db.query('INSERT IGNORE INTO admin_notifications(event_id,user_id,category,title,body,entity_id) VALUES (?,?,?,?,?,?)',[event.id,user.id,category,title,event.body,event.entityId]);
      if(result.affectedRows)delivered.push(user.id);
    }
  } catch (error) { console.error('Notification persistence failed:', error.message); }
  if (namespace) {
    // Recheck access before delivery, including already-connected sessions.
    const [users] = await db.query("SELECT * FROM users WHERE role<>'guest' AND deleted_at IS NULL");
    const permission={rooms:'rooms.view',bookings:'bookings.view',users:'staff.manage',payments:'payments.view',guests:'guests.view',settings:'settings.view'}[category];
    for (const user of users) if(delivered.includes(user.id)&&(await permissions(user)).includes(permission)) namespace.to(`user:${user.id}`).emit('admin:change', event);
  }
  const recipients = [...delivered];
  if (category === 'bookings' || category === 'payments') {
    const sql = category === 'bookings'
      ? "SELECT u.id FROM bookings b JOIN users u ON u.id=b.user_id WHERE b.id=? AND u.role='guest' AND u.deleted_at IS NULL"
      : "SELECT u.id FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN users u ON u.id=b.user_id WHERE p.id=? AND u.role='guest' AND u.deleted_at IS NULL";
    const [guests] = await db.query(sql, [event.entityId]);
    for (const guest of guests) {
      if (preferences[category] !== false) {
        const [result] = await db.query('INSERT IGNORE INTO admin_notifications(event_id,user_id,category,title,body,entity_id) VALUES (?,?,?,?,?,?)', [event.id,guest.id,category,title,event.body,event.entityId]);
        if (!result.affectedRows) continue;
      }
      recipients.push(guest.id);
    }
  }
  for (const id of recipients) notifications?.to(`user:${id}`).emit('notification:change', event);
  if (preferences[category] !== false) require('../routes/push').notify({ userIds: recipients, title, body: event.body, tag: event.id }).catch(error => console.error('Push delivery failed:', error.message));
}
async function publishChat(sender, content, messageId) {
  const event = { id: randomUUID(), category: 'chat', title: `Message from ${sender.name}`, body: String(content).slice(0,500), entityId: messageId };
  const [users] = await db.query("SELECT * FROM users WHERE id<>? AND deleted_at IS NULL AND (role='guest' OR role='staff')", [sender.id]);
  const recipients = users.filter(user => user.role === 'guest' || require('./permissions').profile(user) === 'receptionist');
  for (const user of recipients) {
    await db.query('INSERT INTO admin_notifications(event_id,user_id,category,title,body,entity_id) VALUES (?,?,?,?,?,?)', [event.id,user.id,event.category,event.title,event.body,messageId]);
    notifications?.to(`user:${user.id}`).emit('notification:change', event);
    namespace?.to(`user:${user.id}`).emit('admin:change', event);
  }
  require('../routes/push').notify({ userIds: recipients.map(user => user.id), title: event.title, body: event.body, tag: event.id }).catch(error => console.error('Chat push failed:', error.message));
}
function readChanged(userId) { namespace?.to(`user:${userId}`).emit('admin:read'); notifications?.to(`user:${userId}`).emit('notification:read'); }
function revokeUser(userId) {
  namespace?.in(`user:${userId}`).disconnectSockets(true);
  notifications?.in(`user:${userId}`).disconnectSockets(true);
  for (const socket of root?.of('/').sockets.values() || []) if (socket.user?.id === Number(userId)) socket.disconnect(true);
}
module.exports = { attach, publish, publishChat, readChanged, revokeUser };
