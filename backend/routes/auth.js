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

module.exports = router;
