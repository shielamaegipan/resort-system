require('dotenv').config();
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');
const db = require('./db');
const { auth, verifyToken } = require('./middleware/auth');
const { router: pushRouter, notify } = require('./routes/push');

const app = express();
const server = http.createServer(app);
const origin = process.env.CLIENT_ORIGIN || '*';

app.use(cors({ origin }));
app.use(express.json({ limit: '25mb' })); // raised so large base64 images fit

// Room images
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/push', pushRouter);

// ---------- Role helper (reads the role from the database) ----------
function allow(...roles) {
  return async (req, res, next) => {
    try {
      const [[u]] = await db.query('SELECT role FROM users WHERE id = ? AND deleted_at IS NULL', [req.user.id]);
      if (!u) return res.status(401).json({ error: 'User not found' });
      req.user.role = u.role;
      if (roles.length && !roles.includes(u.role)) {
        return res.status(403).json({ error: 'You are not allowed to do this' });
      }
      next();
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  };
}

// ---------- ROOMS ----------
app.get('/api/rooms', auth, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM rooms WHERE deleted_at IS NULL ORDER BY id');
  res.json(rows);
});

app.get('/api/rooms/available', auth, async (req, res) => {
  const { check_in, check_out, guests = 1 } = req.query;
  if (!check_in || !check_out) return res.status(400).json({ error: 'Choose check-in and check-out dates' });
  const [rows] = await db.query(
    `SELECT * FROM rooms r WHERE r.deleted_at IS NULL AND r.status = 'available' AND r.capacity >= ?
     AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.room_id = r.id AND b.deleted_at IS NULL
       AND b.status IN ('pending','confirmed','checked_in') AND b.check_in < ? AND b.check_out > ?)
     ORDER BY r.id`, [Number(guests) || 1, check_out, check_in]
  );
  res.json(rows);
});

app.get('/api/rooms/archived', auth, allow('admin'), async (req, res) => {
  const [rows] = await db.query('SELECT * FROM rooms WHERE deleted_at IS NOT NULL ORDER BY id');
  res.json(rows);
});

app.post('/api/rooms', auth, allow('admin', 'staff'), async (req, res) => {
  const { name, type = 'Standard', capacity = 2, price_per_night, description = '', status = 'available' } = req.body;
  if (!name || price_per_night === '' || price_per_night == null) return res.status(400).json({ error: 'Name and price are required' });
  const price = Math.round(Number(price_per_night)); // prices are whole numbers
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Price must be a number' });
  const [r] = await db.query(
    'INSERT INTO rooms (name, type, capacity, price_per_night, description, status) VALUES (?,?,?,?,?,?)',
    [name, type, capacity, price, description, status]
  );
  const [[row]] = await db.query('SELECT * FROM rooms WHERE id = ?', [r.insertId]);
  res.status(201).json(row);
});

app.put('/api/rooms/:id', auth, allow('admin', 'staff'), async (req, res) => {
  const { name, type, capacity, description, status } = req.body;
  const price_per_night = req.body.price_per_night === '' || req.body.price_per_night == null ? null : Math.round(Number(req.body.price_per_night));
  if (price_per_night !== null && (!Number.isFinite(price_per_night) || price_per_night < 0)) return res.status(400).json({ error: 'Price must be a number' });
  await db.query(
    `UPDATE rooms SET name = COALESCE(?, name), type = COALESCE(?, type), capacity = COALESCE(?, capacity),
     price_per_night = COALESCE(?, price_per_night), description = COALESCE(?, description),
     status = COALESCE(?, status) WHERE id = ? AND deleted_at IS NULL`,
    [name, type, capacity, price_per_night, description, status, req.params.id]
  );
  const [[row]] = await db.query('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
  res.json(row);
});

app.post('/api/rooms/:id/image', auth, allow('admin', 'staff'), async (req, res) => {
  try {
    const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(req.body.image || '');
    if (!m) return res.status(400).json({ error: 'Invalid image. Use a JPG, PNG or WEBP file.' });
    const [[room]] = await db.query('SELECT id, image_url FROM rooms WHERE id = ?', [req.params.id]);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const ext = m[1] === 'png' ? 'png' : m[1] === 'webp' ? 'webp' : 'jpg';
    const file = `room-${room.id}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, file), Buffer.from(m[2], 'base64'));
    if (room.image_url) fs.unlink(path.join(UPLOAD_DIR, path.basename(room.image_url)), () => {});
    const url = '/uploads/' + file;
    await db.query('UPDATE rooms SET image_url = ? WHERE id = ?', [url, room.id]);
    res.json({ image_url: url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not save the image: ' + (e.code || e.message) });
  }
});

app.delete('/api/rooms/:id', auth, allow('admin', 'staff'), async (req, res) => {
  await db.query('UPDATE rooms SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.post('/api/rooms/:id/restore', auth, allow('admin'), async (req, res) => {
  await db.query('UPDATE rooms SET deleted_at = NULL WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ---------- BOOKINGS ----------
const BOOKING_SELECT = `SELECT b.*, r.name AS room_name FROM bookings b JOIN rooms r ON r.id = b.room_id`;

app.get('/api/bookings', auth, allow(), async (req, res) => {
  const own = req.user.role === 'guest';
  const [rows] = await db.query(
    `${BOOKING_SELECT} WHERE b.deleted_at IS NULL ${own ? 'AND b.user_id = ?' : ''} ORDER BY b.id DESC`,
    own ? [req.user.id] : []
  );
  res.json(rows);
});

app.get('/api/bookings/archived', auth, allow('admin'), async (req, res) => {
  const [rows] = await db.query(`${BOOKING_SELECT} WHERE b.deleted_at IS NOT NULL ORDER BY b.id DESC`);
  res.json(rows);
});

app.post('/api/bookings', auth, allow('guest'), async (req, res) => {
  const { room_id, guest_name, guest_contact = '', guests = 1, check_in, check_out } = req.body;
  if (!room_id || !guest_name || !check_in || !check_out) {
    return res.status(400).json({ error: 'Missing booking details' });
  }
  const nights = Math.round((new Date(check_out) - new Date(check_in)) / 86400000);
  if (!(nights > 0)) return res.status(400).json({ error: 'Check-out must be after check-in' });

  const [[room]] = await db.query(
    "SELECT * FROM rooms WHERE id = ? AND deleted_at IS NULL AND status = 'available'", [room_id]
  );
  if (!room) return res.status(404).json({ error: 'This room is not available' });
  if (Number(guests) > room.capacity) return res.status(400).json({ error: `This room fits up to ${room.capacity} guests only` });

  const [[clash]] = await db.query(
    `SELECT COUNT(*) AS n FROM bookings
     WHERE room_id = ? AND deleted_at IS NULL AND status IN ('pending','confirmed','checked_in')
       AND check_in < ? AND check_out > ?`,
    [room_id, check_out, check_in]
  );
  if (clash.n > 0) return res.status(409).json({ error: 'This room is already booked for those dates' });

  const total = nights * Number(room.price_per_night);
  const [r] = await db.query(
    `INSERT INTO bookings (user_id, room_id, guest_name, guest_contact, guests, check_in, check_out, total_price)
     VALUES (?,?,?,?,?,?,?,?)`,
    [req.user.id, room_id, guest_name, guest_contact, guests, check_in, check_out, total]
  );
  const [[row]] = await db.query(`${BOOKING_SELECT} WHERE b.id = ?`, [r.insertId]);
  notify({ exceptUserId: req.user.id, roles: ['admin', 'staff'], title: 'New booking', body: `${guest_name} - ${room.name}` }).catch(console.error);
  res.status(201).json(row);
});

app.patch('/api/bookings/:id/status', auth, allow(), async (req, res) => {
  const { status } = req.body;
  const valid = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const [[b]] = await db.query('SELECT * FROM bookings WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!b) return res.status(404).json({ error: 'Booking not found' });

  if (req.user.role === 'guest') {
    if (b.user_id !== req.user.id || status !== 'cancelled') {
      return res.status(403).json({ error: 'You can only cancel your own booking' });
    }
    if (b.status !== 'pending') {
      return res.status(403).json({ error: 'This booking is already confirmed. Please contact the front desk to change it.' });
    }
  }
  await db.query('UPDATE bookings SET status = ? WHERE id = ?', [status, req.params.id]);
  const [[row]] = await db.query(`${BOOKING_SELECT} WHERE b.id = ?`, [req.params.id]);
  res.json(row);
});

app.delete('/api/bookings/:id', auth, allow('admin', 'staff'), async (req, res) => {
  await db.query('UPDATE bookings SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.post('/api/bookings/:id/restore', auth, allow('admin'), async (req, res) => {
  await db.query('UPDATE bookings SET deleted_at = NULL WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// STAFF: today's arrivals and departures (front desk list)
app.get('/api/bookings/today', auth, allow('staff'), async (req, res) => {
  const [arrivals] = await db.query(
    `${BOOKING_SELECT} WHERE b.deleted_at IS NULL AND b.check_in = CURDATE() AND b.status IN ('pending','confirmed','checked_in') ORDER BY b.id`
  );
  const [departures] = await db.query(
    `${BOOKING_SELECT} WHERE b.deleted_at IS NULL AND b.check_out = CURDATE() AND b.status = 'checked_in' ORDER BY b.id`
  );
  res.json({ arrivals, departures });
});

// ---------- STAFF ACCOUNTS (admin only) ----------
// The admin creates and manages staff accounts only. Guests register by themselves.
app.get('/api/users', auth, allow('admin'), async (req, res) => {
  const [rows] = await db.query("SELECT id, name, email, role, created_at FROM users WHERE role = 'staff' AND deleted_at IS NULL ORDER BY id");
  res.json(rows);
});

app.post('/api/users', auth, allow('admin'), async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const [[dup]] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
  if (dup) return res.status(409).json({ error: 'Email is already used' });
  const hash = await bcrypt.hash(password, 10);
  const [r] = await db.query("INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?, 'staff')", [name, email, hash]);
  const [[row]] = await db.query('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [r.insertId]);
  res.status(201).json(row);
});

app.delete('/api/users/:id', auth, allow('admin'), async (req, res) => {
  const [r] = await db.query("UPDATE users SET deleted_at = NOW() WHERE id = ? AND role = 'staff' AND deleted_at IS NULL", [req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Staff account not found' });
  res.json({ ok: true });
});

// ---------- REPORTS (admin only) ----------
app.get('/api/reports/summary', auth, allow('admin'), async (req, res) => {
  const [[rev]] = await db.query(
    "SELECT COALESCE(SUM(total_price),0) AS revenue, COUNT(*) AS bookings FROM bookings WHERE deleted_at IS NULL AND status IN ('confirmed','checked_in','checked_out')"
  );
  const [byStatus] = await db.query('SELECT status, COUNT(*) AS n FROM bookings WHERE deleted_at IS NULL GROUP BY status');
  const [monthly] = await db.query(
    `SELECT DATE_FORMAT(check_in, '%Y-%m') AS month, COUNT(*) AS bookings, COALESCE(SUM(total_price),0) AS revenue
     FROM bookings WHERE deleted_at IS NULL AND status IN ('confirmed','checked_in','checked_out')
     GROUP BY month ORDER BY month DESC LIMIT 12`
  );
  const [[rooms]] = await db.query("SELECT COUNT(*) AS total, SUM(status='available') AS available FROM rooms WHERE deleted_at IS NULL");
  const [[occ]] = await db.query(
    "SELECT COUNT(DISTINCT room_id) AS occupied FROM bookings WHERE deleted_at IS NULL AND status = 'checked_in' AND check_in <= CURDATE() AND check_out > CURDATE()"
  );
  const [[usr]] = await db.query("SELECT SUM(role='staff') AS staff, SUM(role='guest') AS guests FROM users WHERE deleted_at IS NULL");
  res.json({ revenue: Number(rev.revenue), bookings: rev.bookings, byStatus, monthly, rooms, occupied_today: occ.occupied, users: usr });
});

// ---------- Chat history ----------
app.get('/api/messages', auth, allow('guest', 'staff'), async (req, res) => {
  const [rows] = await db.query(
    `SELECT m.id, m.content, m.created_at, m.sender_id, u.name AS sender_name
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.room = 'general' ORDER BY m.id DESC LIMIT 50`
  );
  res.json(rows.reverse());
});

// ---------- WebSocket real-time chat ----------
const io = new Server(server, { cors: { origin } });

io.use(async (socket, next) => {
  try {
    socket.user = verifyToken(socket.handshake.auth.token);
    const [[u]] = await db.query('SELECT role FROM users WHERE id = ? AND deleted_at IS NULL', [socket.user.id]);
    if (!u || !['guest', 'staff'].includes(u.role)) return next(new Error('Chat is for guests and staff only'));
    socket.user.role = u.role;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  socket.on('chat:send', async (content) => {
    const text = String(content || '').trim();
    if (!text) return;
    const [r] = await db.query('INSERT INTO messages (sender_id, content) VALUES (?, ?)', [socket.user.id, text]);
    io.emit('chat:receive', {
      id: r.insertId,
      content: text,
      created_at: new Date().toISOString(),
      sender_id: socket.user.id,
      sender_name: socket.user.name,
    });
    notify({ exceptUserId: socket.user.id, roles: ['guest', 'staff'], title: socket.user.name, body: text }).catch(console.error);
  });
});

// ---------- Error handler (e.g. image too large) ----------
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The picture is too large. Please choose a smaller one.' });
  }
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

// ---------- Auto-add the image_url column if it is missing ----------
async function ensureImageColumn() {
  const [cols] = await db.query("SHOW COLUMNS FROM rooms LIKE 'image_url'");
  if (cols.length === 0) {
    await db.query('ALTER TABLE rooms ADD COLUMN image_url VARCHAR(255) NULL AFTER description');
    console.log('Added rooms.image_url column');
  }
}
// ---------- Make existing room prices whole numbers ----------
db.query('UPDATE rooms SET price_per_night = ROUND(price_per_night) WHERE price_per_night <> ROUND(price_per_night)')
  .catch((e) => console.warn('price rounding skipped:', e.message));

ensureImageColumn().catch((e) => console.warn('image_url check skipped:', e.message));

// ---------- Seeds ----------
async function seedUsers() {
  const users = [
    ['Admin', 'admin@resort.com', 'admin123', 'admin'],
    ['Staff', 'staff@resort.com', 'staff123', 'staff'],
    ['Guest', 'guest@resort.com', 'guest123', 'guest'],
  ];
  for (const [name, email, pass, role] of users) {
    const hash = await bcrypt.hash(pass, 10);
    await db.query(
      'INSERT IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, role]
    );
  }
  // Rename the old default names in databases that were created earlier
  await db.query("UPDATE users SET name = 'Admin' WHERE email = 'admin@resort.com' AND name = 'Resort Admin'");
  await db.query("UPDATE users SET name = 'Staff' WHERE email = 'staff@resort.com' AND name = 'Front Desk Staff'");
  await db.query("UPDATE users SET name = 'Guest' WHERE email = 'guest@resort.com' AND name = 'Sample Guest'");
  console.log('Default users ready');
}
seedUsers().catch((e) => console.warn('User seed skipped:', e.message));

async function seedRooms() {
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM rooms');
  if (n > 0) return;
  await db.query(
    'INSERT INTO rooms (name, type, capacity, price_per_night, description) VALUES ?',
    [[
      ['Room 101', 'Standard', 2, 1800, 'Garden view, queen bed, air conditioning'],
      ['Room 102', 'Deluxe', 3, 2800, 'Sea view balcony, king bed, mini fridge'],
      ['Family Suite A', 'Family Suite', 6, 4500, 'Two bedrooms, living area, kitchenette'],
      ['Beach Villa 1', 'Villa', 4, 7500, 'Private pool steps from the shore'],
      ['Cottage Palm', 'Cottage', 2, 2200, 'Native-style cottage near the lagoon'],
    ]]
  );
  console.log('Seeded sample rooms');
}
seedRooms().catch((e) => console.warn('Room seed skipped:', e.message));

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
