const db = require('../db');
const admin = ['dashboard.view','rooms.view','rooms.manage','rooms.archive','rooms.operation','bookings.view','bookings.manage','payments.view','payments.record','payments.verify','payments.refund','reports.view','staff.manage','activity.view','maintenance.manage','settings.view'];
const profiles = {
  super_admin: [...admin, 'roles.manage','settings.manage'], admin,
  receptionist: ['dashboard.view','rooms.view','bookings.view','bookings.manage','payments.view','payments.record','settings.view'],
  housekeeping: ['rooms.view','rooms.operation','maintenance.manage'],
  operational_staff:['rooms.view','rooms.operation','maintenance.manage'], guest: []
};
function profile(user) { return user.permission_role || ({ admin: 'admin', staff: 'receptionist', guest: 'guest' }[user.role]); }
async function permissions(user, c = db) {
  const [rows] = await c.query('SELECT permission FROM role_permissions WHERE role_code=?', [profile(user)]);
  return rows.map(r => r.permission);
}
function requirePermission(permission) { return async (req, res, next) => {
  if (!(await permissions(req.user)).includes(permission)) return res.status(403).json({ error: 'Permission required: ' + permission });
  next();
}; }
async function audit(c, user, type, id, action, details = '') {
  await c.query('INSERT INTO activity_logs(actor_id,entity_type,entity_id,action,details) VALUES (?,?,?,?,?)', [user.id, type, id || null, action, String(details).slice(0, 5000)]);
}
module.exports = { profiles, profile, permissions, requirePermission, audit };
