require('dotenv').config();
const express = require('express');
require('express-async-errors');
const validation = require('./lib/validation');
const bookings = require('./lib/booking-service');
const realtime = require('./lib/realtime');
const http = require('http');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');
const db = require('./db');
const { auth, verifyToken } = require('./middleware/auth');
const { requirePermission, audit, profile } = require('./lib/permissions');
const { router: pushRouter } = require('./routes/push');

const app = express();
const server = http.createServer(app);
const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(s=>s.trim());
if (process.env.RAILWAY_PUBLIC_DOMAIN) origins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
if (process.env.RENDER_EXTERNAL_URL) origins.push(new URL(process.env.RENDER_EXTERNAL_URL).origin);
const origin = (value, callback) => callback(null, !value || origins.includes(value));

if (!process.env.JWT_SECRET) console.warn('WARNING: JWT_SECRET is missing in backend/.env');
process.on('unhandledRejection', (e) => console.error('Unhandled rejection:', e));

// ---------- Make async route handlers safe ----------
// Express 4 does not catch errors thrown inside async handlers, which can crash the
// server or leave the request hanging. This sends them to the error handler instead.
for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
  const original = app[method].bind(app);
  app[method] = (route, ...handlers) => {
    if (handlers.length === 0) return original(route); // app.get('setting') used internally by Express
    return original(route, ...handlers.map((h) => (
      typeof h === 'function' && h.length < 4
        ? (req, res, next) => Promise.resolve(h(req, res, next)).catch(next)
        : h
    )));
  };
}

app.use(cors({ origin }));
app.use(express.json({ limit: '25mb' })); // raised so large base64 images fit
app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff'); if(req.path.startsWith('/api'))res.set('Cache-Control','no-store');next();});
const attempts = new Map();
const rateCleanup = setInterval(()=>{for(const [key,value] of attempts)if(value.until<Date.now())attempts.delete(key);},60000);rateCleanup.unref();
app.use('/api/auth', (req,res,next)=>{
  if(req.method!=='POST')return next();
  const key=req.socket.remoteAddress,now=Date.now();let entry=attempts.get(key);
  if(!entry||entry.until<now){entry={count:0,until:now+60000};attempts.set(key,entry);}
  if(++entry.count>30)return res.status(429).json({error:'Too many authentication attempts. Try again in a minute.'});next();
});
// Apply permissions to legacy APIs as well as the new operations router.
app.use('/api', (req,res,next)=>{
  const match=/^\/(rooms|bookings|users|reports)(?:\/|$)/.exec(req.path);if(!match)return next();
  const resource=match[1],read=req.method==='GET';
  let permission=resource==='users'?'staff.manage':resource==='reports'?'reports.view':resource==='rooms'?(read?'rooms.view':req.method==='DELETE'?'rooms.archive':'rooms.manage'):(read?'bookings.view':'bookings.manage');
  auth(req,res,()=>{
    if(req.user.role==='guest'&&((resource==='rooms'&&read&&!req.path.includes('archived'))||(resource==='bookings'&&((read&&!req.path.includes('archived'))||req.method==='POST'&&req.path==='/bookings'||req.method==='PATCH'&&req.path.endsWith('/status')))))return next();
    requirePermission(permission)(req,res,next).catch(next);
  }).catch(next);
});

// Room images
const UPLOAD_DIR = require('./lib/uploads').publicDir;
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

// Existing JSON response shapes are preserved. Successful writes invalidate Admin caches.
app.use('/api', (req, res, next) => {
  const match = /^\/(rooms|bookings|users)(?:\/(\d+))?(?:\/(status|restore|image|check-in|check-out))?$/.exec(req.path);
  if (match && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const send = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 400) return send(body);
      const category = match[1];
      const action = match[3] === 'restore' ? 'restored' : req.method === 'DELETE' ? (category === 'users' ? 'deactivated' : 'archived') : req.method === 'POST' && !match[2] ? 'created' : 'updated';
      const title = `${category === 'users' ? 'Staff account' : category === 'rooms' ? 'Room' : 'Booking'} ${action}`;
      return realtime.publish(category, title, `${body.name || body.guest_name || '#' + (match[2] || body.id)}${body.status ? ' · ' + body.status.replaceAll('_', ' ') : ''}`, match[2] || body.id)
        .catch((error) => console.error('Admin event failed:', error.message)).then(() => send(body));
    };
  }
  next();
});
app.use('/api/admin', require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/ops', require('./routes/operations'));
app.use('/api/advanced', require('./routes/advanced'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/push', pushRouter);

// ---------- Role helper (reads the role from the database) ----------
function allow(...roles) {
  return async (req, res, next) => {
    try {
      const tokenUser = req.user || {};
      const uid = tokenUser.id ?? tokenUser.userId ?? tokenUser.sub;
      let u = null;

      if (uid != null) {
        [[u]] = await db.query('SELECT id, role FROM users WHERE id = ? AND deleted_at IS NULL', [uid]);
      }
      // The token may carry an old id (for example after the database was re-imported).
      // The token is signed, so its email can be trusted: find the account by email instead.
      if (!u && tokenUser.email) {
        [[u]] = await db.query('SELECT id, role FROM users WHERE email = ? AND deleted_at IS NULL', [tokenUser.email]);
      }

      if (!u) {
        console.warn('[allow] 401 account not found:', req.method, req.originalUrl, 'token =', JSON.stringify(tokenUser));
        return res.status(401).json({ error: 'Account not found. Please log in again.' });
      }

      req.user = { ...tokenUser, id: u.id, role: u.role };
      if (roles.length && !roles.includes(u.role)) {
        console.warn('[allow] 403 role not allowed:', req.method, req.originalUrl, 'role =', u.role, 'needs =', roles.join('/'));
        return res.status(403).json({ error: 'You are not allowed to do this' });
      }
      next();
    } catch (e) {
      console.error('[allow] error:', e);
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
  validation.dates(check_in, check_out);
  validation.integer(guests, 'Guests');
  const [rows] = await db.query(
    `SELECT * FROM rooms r WHERE r.deleted_at IS NULL AND r.status NOT IN ('maintenance','out_of_service') AND (? > ? OR r.status='available') AND r.capacity >= ?
     AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.room_id = r.id AND b.deleted_at IS NULL
       AND b.status IN ('pending','confirmed','checked_in') AND b.check_in < ? AND b.check_out > ?)
     ORDER BY r.id`, [check_in,validation.today(),Number(guests) || 1, check_out, check_in]
  );
  res.json(rows);
});

app.get('/api/rooms/archived', auth, allow('admin'), async (req, res) => {
  const [rows] = await db.query('SELECT * FROM rooms WHERE deleted_at IS NOT NULL ORDER BY id');
  res.json(rows);
});

app.post('/api/rooms', auth, allow('admin', 'staff'), async (req, res) => {
  const data = validation.room(req.body);
  const row=await bookings.transaction(async c=>{
    const number=validation.roomNumber(req.body.room_number);
    const [r] = await c.query('INSERT INTO rooms (name,type,capacity,price_per_night,description,amenities,status,room_number) VALUES (?,?,?,?,?,?,?,?)', [...Object.values(data),number]);
    await audit(c,req.user,'rooms',r.insertId,'room_created',data.name);
    const [[saved]]=await c.query('SELECT * FROM rooms WHERE id=?',[r.insertId]);return saved;
  });
  res.status(201).json(row);
});

app.put('/api/rooms/:id', auth, allow('admin', 'staff'), async (req, res) => {
  const row = await bookings.transaction(async (c) => {
    const previous = await bookings.lockRoom(c, req.params.id);
    if (previous.deleted_at) validation.fail(404, 'Room not found');
    const data = validation.room(req.body, previous);
    if(previous.status==='occupied'&&data.status!=='occupied')validation.fail(409,'Use guest check-out before changing occupied room readiness');
    const [[reserved]] = await c.query(`SELECT COUNT(*) AS n,MAX(guests) AS guests FROM bookings
      WHERE room_id=? AND deleted_at IS NULL AND status IN ('pending','confirmed','checked_in') AND check_out>?`, [req.params.id, validation.today()]);
    if (Number(reserved.guests || 0) > data.capacity) validation.fail(409, 'Capacity cannot be lower than an active reservation guest count');
    if (reserved.n && ['maintenance','out_of_service'].includes(data.status)) validation.fail(409, 'Resolve active reservations before taking the room out of service');
    if (previous.status !== data.status && data.status === 'available') {
      const [[issue]]=await c.query("SELECT id FROM maintenance_records WHERE room_id=? AND status='open' LIMIT 1",[previous.id]);if(issue)validation.fail(409,'Resolve maintenance issues before releasing this room');
    }
    await c.query('UPDATE rooms SET name=?,type=?,capacity=?,price_per_night=?,description=?,amenities=?,status=? WHERE id=?', [...Object.values(data), req.params.id]);
    if(Object.hasOwn(req.body,'room_number'))await c.query('UPDATE rooms SET room_number=? WHERE id=?',[validation.roomNumber(req.body.room_number),previous.id]);
    await audit(c,req.user,'rooms',previous.id,'room_updated',data.name);
    const [[saved]] = await c.query('SELECT * FROM rooms WHERE id=?', [req.params.id]);
    return saved;
  });
  res.json(row);
});

app.post('/api/rooms/:id/image', auth, allow('admin', 'staff'), async (req, res) => {
  const { saveImage,removeImage }=require('./lib/uploads');
  let url;
  try {
    await bookings.transaction(async c=>{
      const room=await bookings.lockRoom(c,req.params.id);if(room.deleted_at)validation.fail(404,'Room not found');
      const [[count]]=await c.query('SELECT COUNT(*) n FROM room_images WHERE room_id=?',[room.id]);if(count.n>=12)validation.fail(400,'Maximum 12 photos per room');
      url=await saveImage(req.body.image);
      if(room.image_url)await c.query('INSERT INTO room_images(room_id,url) SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM room_images WHERE room_id=? AND url=?)',[room.id,room.image_url,room.id,room.image_url]);
      await c.query('INSERT INTO room_images(room_id,url) VALUES (?,?)',[room.id,url]);
      await c.query('UPDATE rooms SET image_url=? WHERE id=?',[url,room.id]);
      await audit(c,req.user,'rooms',room.id,'photo_added');
    });
    res.json({ image_url: url });
  } catch (e) {
    await removeImage(url);throw e;
  }
});

app.delete('/api/rooms/:id', auth, allow('admin', 'staff'), async (req, res) => {
  await bookings.transaction(async (c) => {
    const room = await bookings.lockRoom(c, req.params.id);
    if (room.deleted_at) validation.fail(404, 'Room not found');
    const [[reserved]] = await c.query(`SELECT COUNT(*) AS n FROM bookings WHERE room_id=? AND deleted_at IS NULL AND status IN ('pending','confirmed','checked_in') AND check_out>?`, [req.params.id, validation.today()]);
    if (reserved.n) validation.fail(409, 'Resolve active reservations before archiving this room');
    await c.query('UPDATE rooms SET deleted_at=NOW() WHERE id=?', [req.params.id]);
    await audit(c,req.user,'rooms',room.id,'room_archived');
  });
  res.json({ ok: true });
});

app.post('/api/rooms/:id/restore', auth, allow('admin'), async (req, res) => {
  const [result] = await db.query('UPDATE rooms SET deleted_at=NULL WHERE id=? AND deleted_at IS NOT NULL', [req.params.id]);
  if (!result.affectedRows) validation.fail(404, 'Archived room not found');
  await audit(db,req.user,'rooms',req.params.id,'room_restored');
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

app.post('/api/bookings', auth, allow('guest','admin','staff'), async (req, res) => {
  const row = await bookings.create(req.user.id, req.body);
  res.status(201).json(row);
});

app.patch('/api/bookings/:id/status', auth, allow(), async (req, res) => {
  res.json(await bookings.change(req.params.id, req.user, 'status', req.body.status));
});

app.delete('/api/bookings/:id', auth, allow('admin', 'staff'), async (req, res) => {
  await bookings.change(req.params.id, req.user, 'archive');
  res.json({ ok: true });
});

app.post('/api/bookings/:id/restore', auth, allow('admin'), async (req, res) => {
  await bookings.change(req.params.id, req.user, 'restore');
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
  const [rows] = await db.query("SELECT id, name, email, role, permission_role, created_at FROM users WHERE role = 'staff' AND deleted_at IS NULL ORDER BY id");
  res.json(rows);
});

app.post('/api/users', auth, allow('admin'), async (req, res) => {
  const { name, email, password } = validation.staff(req.body, true);
  const [[dup]] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
  if (dup) return res.status(409).json({ error: 'Email is already used' });
  const hash = await bcrypt.hash(password, 10);
  const [r] = await db.query("INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?, 'staff')", [name, email, hash]);
  const [[row]] = await db.query('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [r.insertId]);
  res.status(201).json(row);
});

app.delete('/api/users/:id', auth, allow('admin'), async (req, res) => {
  const [[target]]=await db.query('SELECT permission_role FROM users WHERE id=?',[req.params.id]);
  if(target?.permission_role&&target.permission_role!=='receptionist')validation.fail(403,'Manage privileged accounts through the permission-aware staff API');
  const [r] = await db.query("UPDATE users SET deleted_at = NOW() WHERE id = ? AND role = 'staff' AND deleted_at IS NULL", [req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Staff account not found' });
  realtime.revokeUser(req.params.id);
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
  const [[rooms]] = await db.query(`SELECT COUNT(*) AS total,COALESCE(SUM(r.status='available' AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.room_id=r.id AND b.deleted_at IS NULL AND (b.status='checked_in' OR (b.status IN ('pending','confirmed') AND b.check_in<=? AND b.check_out>?)))),0) AS available FROM rooms r WHERE r.deleted_at IS NULL`,[validation.today(),validation.today()]);
  const [[occ]] = await db.query(
    "SELECT COUNT(DISTINCT room_id) AS occupied FROM bookings WHERE deleted_at IS NULL AND status = 'checked_in'"
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
  if (['maintenance', 'out_of_service'].includes(room.status)) return res.status(400).json({ error: 'The room is under maintenance' });
  await bookings.change(req.params.id, req.user, 'status', 'checked_in');
  res.json(await getBill(b.id));
}));

app.post('/api/bookings/:id/check-out', auth, allow('staff', 'admin'), wrap(async (req, res) => {
  const bill = await getBill(req.params.id);
  if (!bill) return res.status(404).json({ error: 'Booking not found' });
  if (bill.booking.status !== 'checked_in') return res.status(400).json({ error: 'Only checked-in guests can be checked out' });
  if (bill.balance > 0 && !req.body.allow_unpaid) {
    return res.status(409).json({ error: `Unpaid balance: ${bill.balance}. Collect cash payment first.`, balance: bill.balance, needs_payment: true });
  }
  await bookings.change(req.params.id, req.user, 'status', 'checked_out');
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
  if(req.user.role==='staff'&&profile(req.user)!=='receptionist')return res.status(403).json({error:'Guest communication permission required'});
  const [rows] = await db.query(
    `SELECT m.id, m.content, m.created_at, m.sender_id, u.name AS sender_name
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.room = 'general' ORDER BY m.id DESC LIMIT 50`
  );
  res.json(rows.reverse());
});

// ---------- WebSocket real-time chat ----------
const io = new Server(server, { cors: { origin } });
realtime.attach(io);

io.use(async (socket, next) => {
  try {
    socket.user = verifyToken(socket.handshake.auth.token);
    const [[u]] = await db.query('SELECT role,permission_role,token_version FROM users WHERE id = ? AND deleted_at IS NULL', [socket.user.id]);
    if (!u || !['guest', 'staff'].includes(u.role)) return next(new Error('Chat is for guests and staff only'));
    if((socket.user.version||0)!==u.token_version||(u.role==='staff'&&profile(u)!=='receptionist'))return next(new Error('Communication access denied'));
    socket.user.role = u.role;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  const expiry=setTimeout(()=>socket.disconnect(true),Math.max(0,socket.user.exp*1000-Date.now()));socket.on('disconnect',()=>clearTimeout(expiry));
  socket.on('chat:send', async (content) => {
    try {
    const [[current]]=await db.query('SELECT * FROM users WHERE id=? AND deleted_at IS NULL',[socket.user.id]);
    if(!current||(socket.user.version||0)!==current.token_version||(current.role!=='guest'&&profile(current)!=='receptionist'))return socket.disconnect(true);
    const text = String(content || '').trim();
    if (!text||text.length>2000) return socket.emit('chat:error','Messages must contain 1–2000 characters');
    const [r] = await db.query('INSERT INTO messages (sender_id, content) VALUES (?, ?)', [socket.user.id, text]);
    io.emit('chat:receive', {
      id: r.insertId,
      content: text,
      created_at: new Date().toISOString(),
      sender_id: socket.user.id,
      sender_name: socket.user.name,
    });
    realtime.publishChat(current, text, r.insertId).catch(error => console.error('Chat notification failed:', error.message));
    } catch(error){console.error('Chat delivery failed:',error.message);socket.emit('chat:error','Message could not be sent');}
  });
});

// ---------- Error handler (e.g. image too large) ----------
// Serve the production frontend from the API host, including direct page visits.
const frontendDirectory = path.resolve(__dirname, '../frontend/dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(path.join(frontendDirectory, 'index.html'))) {
  app.use(express.static(frontendDirectory, { index: false }));
  app.get('*', (req, res, next) => {
    if (/^\/(api|uploads|socket\.io)(\/|$)/.test(req.path) || path.extname(req.path)) return next();
    res.set('Cache-Control', 'no-cache').sendFile(path.join(frontendDirectory, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The picture is too large. Please choose a smaller one.' });
  }
  const status = err.code === 'ER_DUP_ENTRY' ? 409 : err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if(status>=500)console.error('Request failed:',err.code||'INTERNAL_ERROR');
  res.status(status).json({ error: err.code === 'ER_DUP_ENTRY' ? 'A record with this email or transaction reference already exists' : status < 500 ? err.message : 'Server error. Please try again.' });
});

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
  console.log('Default users ready');
}


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

const PORT = process.env.PORT || 4000;
async function start() {
  if(!process.env.JWT_SECRET || process.env.JWT_SECRET.length<24)throw new Error('Configure JWT_SECRET with at least 24 random characters');
  await require('./migrate-admin')();
  await require('./migrate-platform')();
  await require('./migrate-advanced')();
  await ensureStaffTables();
  if(process.env.SEED_DEMO==='true'&&process.env.NODE_ENV!=='production'){await seedUsers();await seedRooms();}
  require('./lib/reminders').start();
  server.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
}
start().catch((error) => { console.error('Startup failed:', error.message); process.exitCode = 1; db.end(); });
