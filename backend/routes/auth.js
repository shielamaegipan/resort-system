const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auth, signToken } = require('../middleware/auth');
const v=require('../lib/validation');

const router = express.Router();
const { permissions, profile } = require('../lib/permissions');
const publicUser = async (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, permission_role: profile(u), permissions: await permissions(u) });

// New registrations are always guests
router.post('/register', async (req, res) => {
  try {
    const {name,email,password}=v.staff(req.body,true);
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
    if (password.length < 12) return res.status(400).json({ error: 'New passwords must be at least 12 characters' });
    const [[dup]] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (dup) return res.status(409).json({ error: 'Email is already registered' });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await db.query("INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?, 'guest')", [name, email, hash]);
    const user = { id: r.insertId, name, email, role: 'guest' };
    res.status(201).json({ token: signToken(user), user: await publicUser(user) });
  } catch (e) {
    if(e.status)return res.status(e.status).json({error:e.message});
    console.error(e.message);
    res.status(e.code==='ER_DUP_ENTRY'?409:500).json({ error: e.code==='ER_DUP_ENTRY'?'Email is already registered':'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const [[u]] = await db.query('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [email]);
    if (!u || !(await bcrypt.compare(password, u.password_hash))) {
      return res.status(401).json({ error: 'Wrong email or password' });
    }
    await db.query('UPDATE users SET last_login_at=UTC_TIMESTAMP() WHERE id=?', [u.id]);
    if(u.role!=='guest')await require('../lib/permissions').audit(db,u,'users',u.id,'staff_login');
    res.json({ token: signToken(u), user: await publicUser(u) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', auth, async (req, res) => {
  const [[u]] = await db.query('SELECT id, name, email, role FROM users WHERE id = ? AND deleted_at IS NULL', [req.user.id]);
  if (!u) return res.status(401).json({ error: 'User not found' });
  res.json(await publicUser(req.user));
});

router.get('/profile', auth, async (req, res) => {
  const [[u]] = await db.query('SELECT id, name, email, phone FROM users WHERE id = ? AND deleted_at IS NULL', [req.user.id]);
  if (!u) return res.status(401).json({ error: 'User not found' });
  res.json(u);
});

router.put('/profile', auth, async (req, res) => {
  try {
    if (req.user.role !== 'guest') return res.status(403).json({ error: 'Guest accounts only' });
    const name = v.text(req.body.name, 'Name', 100);
    const email = v.text(req.body.email, 'Email', 150).toLowerCase();
    const phone = String(req.body.phone ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
    if (phone && !/^\d{11}$/.test(phone)) return res.status(400).json({ error: 'Contact number must be exactly 11 digits (numbers only)' });
    const [[dup]] = await db.query('SELECT id FROM users WHERE email = ? AND id <> ?', [email, req.user.id]);
    if (dup) return res.status(409).json({ error: 'Email is already registered' });
    await db.query('UPDATE users SET name=?, email=?, phone=? WHERE id=?', [name, email, phone, req.user.id]);
    res.json({ id: req.user.id, name, email, phone });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error(e.message);
    res.status(e.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ error: e.code === 'ER_DUP_ENTRY' ? 'Email is already registered' : 'Server error' });
  }
});

router.put('/password', auth, async (req, res) => {
  try {
    const current = String(req.body.current_password || '');
    const next = String(req.body.new_password || '');
    if (next.length < 12) return res.status(400).json({ error: 'New passwords must be at least 12 characters' });
    if (next.length > 128) return res.status(400).json({ error: 'Password is too long' });
    const [[u]] = await db.query('SELECT password_hash FROM users WHERE id = ? AND deleted_at IS NULL', [req.user.id]);
    if (!u || !(await bcrypt.compare(current, u.password_hash))) return res.status(400).json({ error: 'Current password is wrong' });
    await db.query('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(next, 10), req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
