const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const v = require('../lib/validation');
const router = express.Router();
router.use(auth);
router.get('/', async (req, res) => {
  const [items] = await db.query('SELECT * FROM admin_notifications WHERE user_id=? ORDER BY id DESC LIMIT 100', [req.user.id]);
  const [[count]] = await db.query('SELECT COUNT(*) unread FROM admin_notifications WHERE user_id=? AND read_at IS NULL', [req.user.id]);
  res.json({ items, unread: count.unread });
});
router.patch('/read', async (req, res) => {
  const id = req.body.id == null ? null : v.integer(req.body.id, 'Notification ID', Number.MAX_SAFE_INTEGER);
  await db.query(`UPDATE admin_notifications SET read_at=COALESCE(read_at,NOW()) WHERE user_id=? ${id ? 'AND id=?' : ''}`, id ? [req.user.id, id] : [req.user.id]);
  require('../lib/realtime').readChanged(req.user.id);
  res.json({ ok: true });
});
module.exports = router;
