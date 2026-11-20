const db = require('../db');
const v = require('./validation');
const { audit, permissions } = require('./permissions');
const select = `SELECT b.*,r.name AS room_name FROM bookings b JOIN rooms r ON r.id=b.room_id`;
const active = ['pending', 'confirmed', 'checked_in'];
async function transaction(work,isolation='READ COMMITTED') {
  const connection = await db.getConnection();
  try { if(!['READ COMMITTED','REPEATABLE READ'].includes(isolation))throw new Error('Invalid isolation');await connection.query(`SET TRANSACTION ISOLATION LEVEL ${isolation}`); await connection.beginTransaction(); const result = await work(connection); await connection.commit(); return result; }
  catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
async function lockRoom(c, id) {
  const [[room]] = await c.query('SELECT * FROM rooms WHERE id=? FOR UPDATE', [id]);
  if (!room) v.fail(404, 'Room not found');
  return room;
}
async function noOverlap(c, b) {
  const [rows] = await c.query(`SELECT id FROM bookings WHERE room_id=? AND id<>? AND deleted_at IS NULL
    AND status IN ('pending','confirmed','checked_in') AND check_in<? AND check_out>? FOR UPDATE`,
  [b.room_id, b.id || 0, b.check_out, b.check_in]);
  if (rows.length) v.fail(409, 'This room is already booked for those dates');
}
async function create(userId, body) {
  const roomId = v.integer(body.room_id, 'Room ID', 2147483647);
  const name = v.text(body.guest_name, 'Guest name', 120);
  const contact = String(body.guest_contact ?? '').trim(); if (!/^\d{11}$/.test(contact)) v.fail(400, 'Contact number must be exactly 11 digits (numbers only)');
  const guests = v.integer(body.guests ?? 1, 'Guests');
  const nights = v.dates(body.check_in, body.check_out);
  if (body.check_in < v.today()) v.fail(400, 'Check-in cannot be in the past');
  return transaction(async (c) => {
    const room = await lockRoom(c, roomId);
    if (room.deleted_at || ['maintenance','out_of_service'].includes(room.status) || (body.check_in===v.today()&&room.status!=='available')) v.fail(409, 'This room is not available');
    if (guests > room.capacity) v.fail(400, `This room fits up to ${room.capacity} guests only`);
    await noOverlap(c, { room_id: roomId, check_in: body.check_in, check_out: body.check_out });
    const [result] = await c.query(`INSERT INTO bookings (user_id,room_id,guest_name,guest_contact,guests,check_in,check_out,total_price)
      VALUES (?,?,?,?,?,?,?,?)`, [userId, roomId, name, contact, guests, body.check_in, body.check_out, nights * Number(room.price_per_night)]);
    await audit(c, { id: userId }, 'bookings', result.insertId, 'booking_created');
    if (body.special_requests) await c.query('UPDATE bookings SET special_requests=? WHERE id=?', [v.text(body.special_requests,'Special requests',5000,false),result.insertId]);
    const [[booking]] = await c.query(`${select} WHERE b.id=?`, [result.insertId]);
    return booking;
  });
}
async function change(id, user, operation, status) {
  return transaction(async (c) => {
    // Always take the room lock first, so all availability mutations serialize.
    const [[found]] = await c.query('SELECT room_id FROM bookings WHERE id=?', [id]);
    if (!found) v.fail(404, 'Booking not found');
    const room = await lockRoom(c, found.room_id);
    const [[b]] = await c.query('SELECT * FROM bookings WHERE id=? FOR UPDATE', [id]);
    if (b.room_id !== found.room_id) v.fail(409,'Reservation was reassigned. Reload and retry');
    if (user.role !== 'guest' && !(await permissions(user,c)).includes('bookings.manage')) v.fail(403,'Booking management permission required');
    if (user.role === 'guest' && operation !== 'status') v.fail(403,'Booking management permission required');
    if (operation === 'status') {
      if (b.deleted_at) v.fail(404, 'Booking not found');
      if (user.role === 'guest' && (b.user_id !== user.id || b.status !== 'pending' || status !== 'cancelled')) v.fail(403, 'You can only cancel your own pending booking');
      const transitions = { pending: ['confirmed', 'cancelled'], confirmed: ['checked_in', 'cancelled','no_show'], checked_in: ['checked_out'], checked_out: [], cancelled: [], no_show:[] };
      if (!transitions[b.status]?.includes(status)) v.fail(409, 'This status transition is not allowed');
      if(status==='no_show'&&v.today()<b.check_in)v.fail(409,'A future reservation cannot be marked no show');
      if (status === 'checked_in') {
        if (v.today() < b.check_in || v.today() >= b.check_out) v.fail(409,'Check-in is only allowed during the booked stay');
        if (b.guests > room.capacity) v.fail(409,'Room capacity exceeded');
        const [[occupant]] = await c.query("SELECT id FROM bookings WHERE room_id=? AND status='checked_in' AND id<>? AND deleted_at IS NULL FOR UPDATE",[room.id,b.id]);
        if (occupant) v.fail(409,'Room still has a checked-in guest');
      }
      if (status === 'checked_out') {
        const [[payment]] = await c.query("SELECT COALESCE(SUM(amount-refunded_amount),0) paid FROM payments WHERE booking_id=? AND status IN ('verified','partially_refunded','refunded')",[b.id]);
        if (Math.round(Number(payment.paid)*100) < Math.round(Number(b.total_price)*100)) v.fail(409,'Settle the outstanding balance before check-out');
      }
      if (active.includes(status)) {
        if (room.deleted_at || ['maintenance','out_of_service'].includes(room.status) || (status==='checked_in'&&room.status!=='available')) v.fail(409, 'Room is not ready, archived or under maintenance');
        await noOverlap(c, b);
      }
      await c.query('UPDATE bookings SET status=? WHERE id=?', [status, id]);
      if (status === 'checked_in') {
        await c.query('UPDATE bookings SET checked_in_at=UTC_TIMESTAMP(),checked_in_by=? WHERE id=?',[user.id,id]);
        await c.query("UPDATE rooms SET status='occupied' WHERE id=?",[room.id]);
      }
      if (status === 'checked_out') {
        await c.query('UPDATE bookings SET checked_out_at=UTC_TIMESTAMP(),checked_out_by=? WHERE id=?',[user.id,id]);
        await c.query("UPDATE rooms SET status='cleaning' WHERE id=?",[room.id]);
      }
    } else if (operation === 'archive') {
      if (b.deleted_at) v.fail(404, 'Booking not found');
      if (!['checked_out', 'cancelled','no_show'].includes(b.status)) v.fail(409, 'Only completed or cancelled bookings can be archived');
      await c.query('UPDATE bookings SET deleted_at=NOW() WHERE id=?', [id]);
    } else {
      if (!b.deleted_at) v.fail(409, 'Booking is already active');
      if (active.includes(b.status)) {
        if (room.deleted_at || room.status !== 'available' || b.guests > room.capacity) v.fail(409, 'Room cannot accept this booking');
        await noOverlap(c, b);
      }
      await c.query('UPDATE bookings SET deleted_at=NULL WHERE id=?', [id]);
    }
    const [[row]] = await c.query(`${select} WHERE b.id=?`, [id]);
    await audit(c,user,'bookings',id,operation==='status'?`booking_${status}`:`booking_${operation}`);
    return row;
  });
}
module.exports = { create, change, transaction, lockRoom, noOverlap };
