const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auth, signToken } = require('../middleware/auth');

const router = express.Router();
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

// New registrations are always guests
router.post('/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const [[dup]] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (dup) return res.status(409).json({ error: 'Email is already registered' });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await db.query("INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?, 'guest')", [name, email, hash]);
    const user = { id: r.insertId, name, email, role: 'guest' };
    res.status(201).json({ token: signToken(user), user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
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
    res.json({ token: signToken(u), user: publicUser(u) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', auth, async (req, res) => {
  const [[u]] = await db.query('SELECT id, name, email, role FROM users WHERE id = ? AND deleted_at IS NULL', [req.user.id]);
  if (!u) return res.status(401).json({ error: 'User not found' });
  res.json(u);
});

module.exports = router;
