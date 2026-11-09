const router = require('express').Router();
const db = require('../db');
const { auth } = require('../middleware/auth');
const { notify } = require('./push');

router.use(auth);

// READ: active lang
router.get('/', async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM items WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json(rows);
});

// READ: archived
router.get('/archived', async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM items WHERE user_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC',
    [req.user.id]
  );
  res.json(rows);
});

// CREATE
router.post('/', async (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: 'Kailangan ang title' });
  const [r] = await db.query(
    'INSERT INTO items (user_id, title, description) VALUES (?, ?, ?)',
    [req.user.id, title, description || null]
  );
  notify({ userIds: [req.user.id], title: 'Item saved', body: title }).catch(console.error);
  res.status(201).json({ id: r.insertId, title, description });
});

// UPDATE
router.put('/:id', async (req, res) => {
  const { title, description } = req.body;
  const [r] = await db.query(
    'UPDATE items SET title = ?, description = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [title, description || null, req.params.id, req.user.id]
  );
  if (!r.affectedRows) return res.status(404).json({ error: 'Hindi nahanap' });
  res.json({ message: 'Updated' });
});

// SOFT DELETE / ARCHIVE
router.delete('/:id', async (req, res) => {
  const [r] = await db.query(
    'UPDATE items SET deleted_at = NOW() WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [req.params.id, req.user.id]
  );
  if (!r.affectedRows) return res.status(404).json({ error: 'Hindi nahanap' });
  res.json({ message: 'Archived' });
});

// RESTORE
router.patch('/:id/restore', async (req, res) => {
  const [r] = await db.query(
    'UPDATE items SET deleted_at = NULL WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL',
    [req.params.id, req.user.id]
  );
  if (!r.affectedRows) return res.status(404).json({ error: 'Hindi nahanap' });
  res.json({ message: 'Restored' });
});

module.exports = router;
