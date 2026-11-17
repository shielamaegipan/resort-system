const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auth } = require('../middleware/auth');
const v = require('../lib/validation');
const { publish } = require('../lib/realtime');
const { requirePermission } = require('../lib/permissions');
const router = express.Router();
router.use(auth, (req,res,next)=>{
  const resource=req.path.split('/')[1];
  const permission={rooms:'rooms.view',users:'staff.manage',bookings:'bookings.view',reports:'reports.view'}[resource];
  if(permission)return requirePermission(permission)(req,res,next);
  if(resource==='notifications'&&req.user.role!=='guest')return next();
  res.status(403).json({error:'Staff access required'});
});

router.get('/rooms', async (req, res) => {
  const { check_in, check_out } = req.query;
  if (check_in || check_out) v.dates(check_in, check_out);
  const start = check_in || v.today();
  const end = check_out || new Date(Date.parse(start) + 86400000).toISOString().slice(0, 10);
  const [rooms] = await db.query(`SELECT r.*, (r.status NOT IN ('maintenance','out_of_service') AND (? > ? OR r.status='available') AND NOT EXISTS (
    SELECT 1 FROM bookings b WHERE b.room_id=r.id AND b.deleted_at IS NULL
      AND b.status IN ('pending','confirmed','checked_in') AND b.check_in<? AND b.check_out>?
    )) AS available_for_dates FROM rooms r ORDER BY r.id`, [start,v.today(),end, start]);
  res.json(rooms);
});
router.get('/users', async (req, res) => {
  const [rows] = await db.query("SELECT id,name,email,role,created_at,deleted_at FROM users WHERE role='staff' ORDER BY id DESC");
  res.json(rows);
});
router.get('/bookings', async (req, res) => {
  const page = req.query.page ? v.integer(req.query.page, 'Page', 1000000) : 1;
  const limit = 10;
  const search = v.text(req.query.search, 'Search', 150, false);
  const status = req.query.status || '';
  if (status && !['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled','no_show'].includes(status)) v.fail(400, 'Invalid booking status');
  const where = `WHERE b.deleted_at IS ${req.query.archived === '1' ? 'NOT ' : ''}NULL
    AND (?='' OR b.status=?) AND (?='' OR CONCAT_WS(' ',b.id,b.guest_name,b.guest_contact,r.name) LIKE ?)`;
  const params = [status, status, search, `%${search.replace(/[\\%_]/g, '\\$&')}%`];
  const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM bookings b JOIN rooms r ON r.id=b.room_id ${where}`, params);
  const actualPage = Math.min(page, Math.max(1, Math.ceil(count.total / limit)));
  const [items] = await db.query(`SELECT b.*,r.name AS room_name FROM bookings b JOIN rooms r ON r.id=b.room_id ${where} ORDER BY b.id DESC LIMIT ? OFFSET ?`, [...params, limit, (actualPage - 1) * limit]);
  res.json({ items, total: count.total, page: actualPage, pages: Math.max(1, Math.ceil(count.total / limit)) });
});
router.put('/users/:id', async (req, res) => {
  const [[target]]=await db.query('SELECT permission_role FROM users WHERE id=?',[req.params.id]);
  if(target?.permission_role&&target.permission_role!=='receptionist')v.fail(403,'Use the permission-aware staff API');
  const { name, email, password } = v.staff(req.body);
  const values = [name, email];
  let sql = 'UPDATE users SET name=?,email=?';
  if (password) { sql += ',password_hash=?'; values.push(await bcrypt.hash(password, 10)); }
  sql += " WHERE id=? AND role='staff'"; values.push(req.params.id);
  const [result] = await db.query(sql, values);
  if (!result.affectedRows) v.fail(404, 'Staff account not found');
  await publish('users', 'Staff account updated', `${name}'s account was updated.`, req.params.id);
  res.json({ ok: true });
});
router.post('/users/:id/restore', async (req, res) => {
  const [[target]]=await db.query('SELECT permission_role FROM users WHERE id=?',[req.params.id]);
  if(target?.permission_role&&target.permission_role!=='receptionist')v.fail(403,'Use the permission-aware staff API');
  const [result] = await db.query("UPDATE users SET deleted_at=NULL WHERE id=? AND role='staff' AND deleted_at IS NOT NULL", [req.params.id]);
  if (!result.affectedRows) v.fail(404, 'Inactive staff account not found');
  await publish('users', 'Staff account activated', 'A staff account was reactivated.', req.params.id);
  res.json({ ok: true });
});
router.get('/notifications', async (req, res) => {
  const [items] = await db.query('SELECT * FROM admin_notifications WHERE user_id=? ORDER BY id DESC LIMIT 100', [req.user.id]);
  const [[count]] = await db.query('SELECT COUNT(*) AS unread FROM admin_notifications WHERE user_id=? AND read_at IS NULL', [req.user.id]);
  res.json({ items, unread: count.unread });
});
router.patch('/notifications/read', async (req, res) => {
  const id = req.body.id == null ? null : v.integer(req.body.id, 'Notification ID', Number.MAX_SAFE_INTEGER);
  await db.query(`UPDATE admin_notifications SET read_at=COALESCE(read_at,NOW()) WHERE user_id=? ${id ? 'AND id=?' : ''}`, id ? [req.user.id, id] : [req.user.id]);
  // Sync read state to other sessions without generating another notification.
  const { readChanged } = require('../lib/realtime');
  readChanged(req.user.id);
  res.json({ ok: true });
});

router.get('/reports', async (req, res) => {
  const start = req.query.start || null, end = req.query.end || null;
  if ((start && !v.date(start)) || (end && !v.date(end)) || (start && end && start > end)) v.fail(400, 'Choose a valid report date range');
  // Revenue retains the existing rule: confirmed + checked-in + checked-out value.
  // Archived history is included so archiving does not erase earned revenue.
  const where = `WHERE (? IS NULL OR check_in>=?) AND (? IS NULL OR check_in<=?)`;
  const params = [start, start, end, end];
  const connection = await db.getConnection();
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction();
    const [[totals]] = await connection.query(`SELECT COUNT(*) AS bookings,
      COALESCE(SUM(CASE WHEN status IN ('confirmed','checked_in','checked_out') THEN total_price ELSE 0 END),0) AS revenue,
      COALESCE(SUM(status='pending'),0) AS pending,COALESCE(SUM(status='confirmed'),0) AS confirmed,
      COALESCE(SUM(status='cancelled'),0) AS cancelled FROM bookings ${where}`, params);
    const [byStatus] = await connection.query(`SELECT status,COUNT(*) AS n FROM bookings ${where} GROUP BY status`, params);
    const [monthly] = await connection.query(`SELECT DATE_FORMAT(check_in,'%Y-%m') AS month,COUNT(*) AS bookings,
      COALESCE(SUM(CASE WHEN status IN ('confirmed','checked_in','checked_out') THEN total_price ELSE 0 END),0) AS revenue
      FROM bookings ${where} GROUP BY month ORDER BY month DESC LIMIT 12`, params);
    const today = v.today();
    const [[rooms]] = await connection.query(`SELECT COUNT(*) AS total,
      COALESCE(SUM(r.status='available' AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.room_id=r.id AND b.deleted_at IS NULL
        AND b.status IN ('pending','confirmed','checked_in') AND b.check_in<=? AND b.check_out>?)),0) AS available
      FROM rooms r WHERE r.deleted_at IS NULL`, [today, today]);
    const [[occupied]] = await connection.query(`SELECT COUNT(DISTINCT b.room_id) AS n FROM bookings b JOIN rooms r ON r.id=b.room_id
      WHERE b.deleted_at IS NULL AND r.deleted_at IS NULL AND b.status='checked_in' AND b.check_in<=? AND b.check_out>?`, [today, today]);
    const [[users]] = await connection.query("SELECT COALESCE(SUM(role='staff'),0) AS staff,COALESCE(SUM(role='guest'),0) AS guests FROM users WHERE deleted_at IS NULL");
    const [recent] = await connection.query(`SELECT b.*,r.name AS room_name FROM bookings b JOIN rooms r ON r.id=b.room_id WHERE b.deleted_at IS NULL ORDER BY b.id DESC LIMIT 5`);
    const days = Array.from({ length: 14 }, (_, i) => new Date(Date.parse(today) - (13 - i) * 86400000).toISOString().slice(0, 10));
    const [stays] = await connection.query(`SELECT check_in,check_out,room_id FROM bookings WHERE deleted_at IS NULL
      AND status IN ('confirmed','checked_in','checked_out') AND check_in<=? AND check_out>?`, [today, days[0]]);
    const occupancy = days.map((day) => ({ day, occupied: new Set(stays.filter((b) => b.check_in<=day && b.check_out>day).map((b) => b.room_id)).size }));
    await connection.commit();
    res.json({ ...totals, revenue: Number(totals.revenue), byStatus, monthly: monthly.reverse().map((m) => ({ ...m, revenue: Number(m.revenue) })), rooms, occupied_today: occupied.n, users, recent, occupancy, today, timezone: 'Asia/Manila' });
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
});
module.exports = router;
