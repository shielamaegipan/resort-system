const { randomUUID } = require('crypto');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { permissions } = require('./permissions');
let namespace;
let root;
function attach(io) {
  root = io;
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
  const preferences=settings?.notification_preferences?JSON.parse(settings.notification_preferences):{};
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
}
function readChanged(userId) { namespace?.to(`user:${userId}`).emit('admin:read'); }
function revokeUser(userId) {
  namespace?.in(`user:${userId}`).disconnectSockets(true);
  for (const socket of root?.of('/').sockets.values() || []) if (socket.user?.id === Number(userId)) socket.disconnect(true);
}
module.exports = { attach, publish, readChanged, revokeUser };
