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

// ---------- DASHBOARD (admin only) ----------
app.get('/api/dashboard', auth, allow('admin'), async (req, res) => {
  try {
    const [[rooms]] = await db.query("SELECT COUNT(*) AS total, COALESCE(SUM(status='available'),0) AS available, COALESCE(SUM(status='maintenance'),0) AS maintenance FROM rooms WHERE deleted_at IS NULL");
    const [[occ]] = await db.query("SELECT COUNT(DISTINCT room_id) AS occupied FROM bookings WHERE deleted_at IS NULL AND status = 'checked_in' AND check_in <= CURDATE() AND check_out > CURDATE()");
    const [[today]] = await db.query(
      `SELECT COALESCE(SUM(check_in = CURDATE() AND status IN ('pending','confirmed','checked_in')),0) AS arrivals,
              COALESCE(SUM(check_out = CURDATE() AND status = 'checked_in'),0) AS departures
       FROM bookings WHERE deleted_at IS NULL`
    );
    const [[pending]] = await db.query("SELECT COUNT(*) AS n FROM bookings WHERE deleted_at IS NULL AND status = 'pending'");
    const [[month]] = await db.query(
      `SELECT COALESCE(SUM(total_price),0) AS revenue, COUNT(*) AS bookings FROM bookings
       WHERE deleted_at IS NULL AND status IN ('confirmed','checked_in','checked_out')
         AND DATE_FORMAT(check_in, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`
    );
    const [[usr]] = await db.query("SELECT COALESCE(SUM(role='staff'),0) AS staff, COALESCE(SUM(role='guest'),0) AS guests FROM users WHERE deleted_at IS NULL");
    const [recent] = await db.query(`${BOOKING_SELECT} WHERE b.deleted_at IS NULL ORDER BY b.id DESC LIMIT 5`);
    res.json({
      rooms, occupied_today: occ.occupied,
      arrivals_today: Number(today.arrivals), departures_today: Number(today.departures),
      pending_bookings: pending.n,
      month_revenue: Number(month.revenue), month_bookings: month.bookings,
      users: usr, recent_bookings: recent,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
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

// =====================================================================
// STAFF FEATURES: Dashboard, Room Availability, Check-in/out,
// Cash Payments, Guest Count, Services
// =====================================================================
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

// Bill of one booking = room total + services - cash paid
async function getBill(bookingId) {
  const [[b]] = await db.query(`${BOOKING_SELECT} WHERE b.id = ? AND b.deleted_at IS NULL`, [bookingId]);
  if (!b) return null;
  const [[s]] = await db.query('SELECT COALESCE(SUM(price * quantity),0) AS t FROM booking_services WHERE booking_id = ?', [bookingId]);
  const [[p]] = await db.query('SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE booking_id = ?', [bookingId]);
  const room_total = Number(b.total_price);
  const services_total = Number(s.t);
  const paid = Number(p.t);
  const total = room_total + services_total;
  return { booking: b, room_total, services_total, total, paid, balance: total - paid };
}

// ---------- 1. STAFF DASHBOARD ----------
app.get('/api/staff/dashboard', auth, allow('staff', 'admin'), wrap(async (req, res) => {
  const [[rooms]] = await db.query("SELECT COUNT(*) AS total, COALESCE(SUM(status='available'),0) AS available, COALESCE(SUM(status='maintenance'),0) AS maintenance FROM rooms WHERE deleted_at IS NULL");
  const [[occ]] = await db.query("SELECT COUNT(DISTINCT room_id) AS occupied FROM bookings WHERE deleted_at IS NULL AND status = 'checked_in' AND check_in <= CURDATE() AND check_out > CURDATE()");
  const [[today]] = await db.query(
    `SELECT COALESCE(SUM(IF(check_in = CURDATE() AND status IN ('pending','confirmed','checked_in'), 1, 0)),0) AS arrivals,
            COALESCE(SUM(IF(check_in = CURDATE() AND status IN ('pending','confirmed','checked_in'), guests, 0)),0) AS arriving_guests,
            COALESCE(SUM(IF(check_out = CURDATE() AND status = 'checked_in', 1, 0)),0) AS departures,
            COALESCE(SUM(IF(check_out = CURDATE() AND status = 'checked_in', guests, 0)),0) AS departing_guests,
            COALESCE(SUM(IF(status = 'checked_in', guests, 0)),0) AS in_house_guests
     FROM bookings WHERE deleted_at IS NULL`
  );
  const [[pending]] = await db.query("SELECT COUNT(*) AS n FROM bookings WHERE deleted_at IS NULL AND status = 'pending'");
  const [[cash]] = await db.query('SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS n FROM payments WHERE DATE(created_at) = CURDATE()');
  const [[svc]] = await db.query('SELECT COALESCE(SUM(quantity),0) AS n FROM booking_services WHERE DATE(created_at) = CURDATE()');
  const [pendingList] = await db.query(`${BOOKING_SELECT} WHERE b.deleted_at IS NULL AND b.status = 'pending' ORDER BY b.id DESC LIMIT 5`);
  res.json({
    rooms,
    occupied_today: occ.occupied,
    free_today: Math.max(0, Number(rooms.available) - occ.occupied),
    arrivals_today: Number(today.arrivals),
    arriving_guests: Number(today.arriving_guests),
    departures_today: Number(today.departures),
    departing_guests: Number(today.departing_guests),
    in_house_guests: Number(today.in_house_guests),
    pending_bookings: pending.n,
    cash_today: Number(cash.total),
    payments_today: cash.n,
    services_today: Number(svc.n),
    pending_list: pendingList,
  });
}));

// ---------- 2. ROOM AVAILABILITY (per date) ----------
// GET /api/rooms/availability?date=YYYY-MM-DD   (default: today)
// state: available | reserved | occupied | maintenance
app.get('/api/rooms/availability', auth, allow('staff', 'admin'), wrap(async (req, res) => {
  const date = req.query.date;
  if (date && !isDate(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
  const [[d]] = await db.query('SELECT COALESCE(?, CURDATE()) AS d', [date || null]);
  const day = d.d;
  const [rooms] = await db.query('SELECT * FROM rooms WHERE deleted_at IS NULL ORDER BY id');
  const [bks] = await db.query(
    `SELECT id, room_id, guest_name, guests, check_in, check_out, status FROM bookings
     WHERE deleted_at IS NULL AND status IN ('pending','confirmed','checked_in') AND check_in <= ? AND check_out > ?
     ORDER BY FIELD(status,'checked_in','confirmed','pending')`, [day, day]
  );
  const byRoom = {};
  for (const b of bks) if (!byRoom[b.room_id]) byRoom[b.room_id] = b;
  const out = rooms.map((r) => {
    const b = byRoom[r.id] || null;
    let state = 'available';
    if (r.status === 'maintenance') state = 'maintenance';
    else if (b && b.status === 'checked_in') state = 'occupied';
    else if (b) state = 'reserved';
    return { ...r, state, booking: b };
  });
  const summary = { available: 0, reserved: 0, occupied: 0, maintenance: 0 };
  out.forEach((r) => { summary[r.state]++; });
  res.json({ date: day, summary, rooms: out });
}));

// ---------- 3. CHECK-IN / CHECK-OUT ----------
app.post('/api/bookings/:id/check-in', auth, allow('staff', 'admin'), wrap(async (req, res) => {
  const [[b]] = await db.query(
    'SELECT b.*, (b.check_in <= CURDATE()) AS arrived, (b.check_out > CURDATE()) AS not_expired FROM bookings b WHERE b.id = ? AND b.deleted_at IS NULL', [req.params.id]
  );
  if (!b) return res.status(404).json({ error: 'Booking not found' });
  if (b.status === 'pending') return res.status(400).json({ error: 'Confirm the booking first before check-in' });
  if (b.status !== 'confirmed') return res.status(400).json({ error: `Cannot check in a booking that is ${b.status.replace('_', ' ')}` });
  if (!b.arrived) return res.status(400).json({ error: 'The check-in date has not arrived yet' });
  if (!b.not_expired) return res.status(400).json({ error: 'This booking has already passed its check-out date' });
  const [[room]] = await db.query('SELECT status FROM rooms WHERE id = ? AND deleted_at IS NULL', [b.room_id]);
  if (!room) return res.status(400).json({ error: 'Room no longer exists' });
  if (room.status === 'maintenance') return res.status(400).json({ error: 'The room is under maintenance' });
  await db.query("UPDATE bookings SET status = 'checked_in' WHERE id = ?", [b.id]);
  res.json(await getBill(b.id));
}));

app.post('/api/bookings/:id/check-out', auth, allow('staff', 'admin'), wrap(async (req, res) => {
  const bill = await getBill(req.params.id);
  if (!bill) return res.status(404).json({ error: 'Booking not found' });
  if (bill.booking.status !== 'checked_in') return res.status(400).json({ error: 'Only checked-in guests can be checked out' });
  if (bill.balance > 0 && !req.body.allow_unpaid) {
    return res.status(409).json({ error: `Unpaid balance: ${bill.balance}. Collect cash payment first.`, balance: bill.balance, needs_payment: true });
  }
  await db.query("UPDATE bookings SET status = 'checked_out' WHERE id = ?", [req.params.id]);
  res.json(await getBill(req.params.id));
}));

// ---------- 4. CASH PAYMENTS ----------
app.get('/api/bookings/:id/bill', auth, allow('staff', 'admin'), wrap(async (req, res) => {
  const bill = await getBill(req.params.id);
  if (!bill) return res.status(404).json({ error: 'Booking not found' });
  const [payments] = await db.query(
    `SELECT p.*, u.name AS received_by_name FROM payments p JOIN users u ON u.id = p.received_by
     WHERE p.booking_id = ? ORDER BY p.id DESC`, [req.params.id]
  );
  const [services] = await db.query('SELECT * FROM booking_services WHERE booking_id = ? ORDER BY id', [req.params.id]);
  res.json({ ...bill, payments, services });
}));

app.post('/api/bookings/:id/payments', auth, allow('staff', 'admin'), wrap(async (req, res) => {
  const amount = Math.round(Number(req.body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Enter a cash amount greater than 0' });
  const bill = await getBill(req.params.id);
  if (!bill) return res.status(404).json({ error: 'Booking not found' });
  if (bill.booking.status === 'cancelled') return res.status(400).json({ error: 'This booking is cancelled' });
  if (amount > bill.balance) return res.status(400).json({ error: `Amount is more than the balance (${bill.balance})` });
  await db.query(
    "INSERT INTO payments (booking_id, amount, method, note, received_by) VALUES (?, ?, 'cash', ?, ?)",
    [req.params.id, amount, String(req.body.note || '').slice(0, 255), req.user.id]
  );
  res.status(201).json(await getBill(req.params.id));
}));

// All cash received on a date (default today). ?date=YYYY-MM-DD
app.get('/api/payments', auth, allow('staff', 'admin'), wrap(async (req, res) => {
  const date = req.query.date;
  if (date && !isDate(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
  const [rows] = await db.query(
    `SELECT p.*, b.guest_name, r.name AS room_name, u.name AS received_by_name
     FROM payments p JOIN bookings b ON b.id = p.booking_id JOIN rooms r ON r.id = b.room_id JOIN users u ON u.id = p.received_by
     WHERE DATE(p.created_at) = COALESCE(?, CURDATE()) ORDER BY p.id DESC`, [date || null]
  );
  const total = rows.reduce((t, p) => t + Number(p.amount), 0);
  res.json({ total, count: rows.length, payments: rows });
}));

// ---------- 5. GUEST COUNT ----------
// GET /api/guests/count?date=YYYY-MM-DD   (default today)
app.get('/api/guests/count', auth, allow('staff', 'admin'), wrap(async (req, res) => {
  const date = req.query.date;
  if (date && !isDate(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
  const [[d]] = await db.query('SELECT COALESCE(?, CURDATE()) AS d', [date || null]);
  const day = d.d;
  const [[inh]] = await db.query(
    "SELECT COUNT(*) AS bookings, COALESCE(SUM(guests),0) AS guests FROM bookings WHERE deleted_at IS NULL AND status = 'checked_in' AND check_in <= ? AND check_out > ?", [day, day]
  );
  const [[arr]] = await db.query(
    "SELECT COUNT(*) AS bookings, COALESCE(SUM(guests),0) AS guests FROM bookings WHERE deleted_at IS NULL AND status IN ('pending','confirmed','checked_in') AND check_in = ?", [day]
  );
  const [[dep]] = await db.query(
    "SELECT COUNT(*) AS bookings, COALESCE(SUM(guests),0) AS guests FROM bookings WHERE deleted_at IS NULL AND status IN ('checked_in','checked_out') AND check_out = ?", [day]
  );
  const [inHouseList] = await db.query(
    `${BOOKING_SELECT} WHERE b.deleted_at IS NULL AND b.status = 'checked_in' AND b.check_in <= ? AND b.check_out > ? ORDER BY r.name`, [day, day]
  );
  res.json({
    date: day,
    in_house: { bookings: inh.bookings, guests: Number(inh.guests) },
    arriving: { bookings: arr.bookings, guests: Number(arr.guests) },
    departing: { bookings: dep.bookings, guests: Number(dep.guests) },
    in_house_list: inHouseList,
  });
}));

// ---------- 6. SERVICES ----------
app.get('/api/services', auth, allow(), wrap(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM services WHERE deleted_at IS NULL ORDER BY name');
  res.json(rows);
}));

app.post('/api/services', auth, allow('staff', 'admin'), wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const price = Math.round(Number(req.body.price));
  if (!name) return res.status(400).json({ error: 'Service name is required' });
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Price must be a number' });
  const [r] = await db.query('INSERT INTO services (name, price, description) VALUES (?,?,?)', [name, price, String(req.body.description || '')]);
  const [[row]] = await db.query('SELECT * FROM services WHERE id = ?', [r.insertId]);
  res.status(201).json(row);
}));

app.put('/api/services/:id', auth, allow('staff', 'admin'), wrap(async (req, res) => {
  const price = req.body.price === '' || req.body.price == null ? null : Math.round(Number(req.body.price));
  if (price !== null && (!Number.isFinite(price) || price < 0)) return res.status(400).json({ error: 'Price must be a number' });
  await db.query(
    'UPDATE services SET name = COALESCE(?, name), price = COALESCE(?, price), description = COALESCE(?, description) WHERE id = ? AND deleted_at IS NULL',
    [req.body.name || null, price, req.body.description ?? null, req.params.id]
  );
  const [[row]] = await db.query('SELECT * FROM services WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Service not found' });
  res.json(row);
}));

app.delete('/api/services/:id', auth, allow('staff', 'admin'), wrap(async (req, res) => {
  await db.query('UPDATE services SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// Services used by a guest (they are added to the bill)
app.post('/api/bookings/:id/services', auth, allow('staff', 'admin'), wrap(async (req, res) => {
  const quantity = Math.max(1, Math.floor(Number(req.body.quantity) || 1));
  const [[svc]] = await db.query('SELECT * FROM services WHERE id = ? AND deleted_at IS NULL', [req.body.service_id]);
  if (!svc) return res.status(404).json({ error: 'Service not found' });
  const [[b]] = await db.query('SELECT id, status FROM bookings WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!b) return res.status(404).json({ error: 'Booking not found' });
  if (!['confirmed', 'checked_in'].includes(b.status)) {
    return res.status(400).json({ error: 'Services can only be added to confirmed or checked-in bookings' });
  }
  await db.query(
    'INSERT INTO booking_services (booking_id, service_id, name, price, quantity, added_by) VALUES (?,?,?,?,?,?)',
    [b.id, svc.id, svc.name, svc.price, quantity, req.user.id]
  );
  res.status(201).json(await getBill(b.id));
}));

app.delete('/api/bookings/:id/services/:serviceRowId', auth, allow('staff', 'admin'), wrap(async (req, res) => {
  await db.query('DELETE FROM booking_services WHERE id = ? AND booking_id = ?', [req.params.serviceRowId, req.params.id]);
  res.json(await getBill(req.params.id));
}));

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

// ---------- Auto-create the staff-feature tables (services, booking_services, payments) ----------
async function ensureStaffTables() {
  await db.query(`CREATE TABLE IF NOT EXISTS services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    description VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS booking_services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    service_id INT NULL,
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    added_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id),
    FOREIGN KEY (added_by) REFERENCES users(id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    method ENUM('cash') NOT NULL DEFAULT 'cash',
    note VARCHAR(255) NULL,
    received_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id),
    FOREIGN KEY (received_by) REFERENCES users(id)
  )`);
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM services');
  if (n === 0) {
    await db.query('INSERT INTO services (name, price, description) VALUES ?', [[
      ['Breakfast', 250, 'Per person'],
      ['Airport / Port Pickup', 1500, 'One way'],
      ['Island Hopping Tour', 1800, 'Per person'],
      ['Massage (1 hour)', 800, 'Per person'],
      ['Extra Bed', 500, 'Per night'],
      ['Laundry', 200, 'Per load'],
    ]]);
    console.log('Seeded sample services');
  }
}
ensureStaffTables().catch((e) => console.warn('Staff tables setup failed:', e.message));

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
