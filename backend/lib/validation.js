function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function text(value, label, max, required = true) {
  if (value != null && typeof value !== 'string') fail(400, `${label} must be text`);
  const result = (value || '').trim();
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result))fail(400,`${label} contains invalid control characters`);
  if ((required && !result) || result.length > max) fail(400, `${label} must be ${required ? '1' : '0'}–${max} characters`);
  return result;
}
function integer(value, label, max = 1000) {
  if (!['string', 'number'].includes(typeof value)) fail(400, `${label} must be a whole number`);
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) fail(400, `${label} must be a positive whole number (maximum ${max})`);
  return n;
}
function date(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function dates(start, end) {
  if (!date(start) || !date(end) || end <= start) fail(400, 'Choose valid dates with check-out after check-in');
  return Math.round((Date.parse(end) - Date.parse(start)) / 86400000);
}
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()); }
function staff(body, passwordRequired = false) {
  const name = text(body.name, 'Name', 100);
  const email = text(body.email, 'Email', 150).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address');
  const password = body.password;
  if ((passwordRequired || password) && (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password,'utf8') > 72)) fail(400, 'Password must be 12–72 characters');
  return { name, email, password };
}
function room(body, previous = {}) {
  const v = { ...previous, ...body };
  const name = text(v.name, 'Name', 100);
  const type = text(v.type ?? 'Standard', 'Room type', 50);
  const capacity = integer(v.capacity ?? 2, 'Capacity');
  if (v.price_per_night == null || v.price_per_night === '' || !Number.isFinite(Number(v.price_per_night)) || Number(v.price_per_night) < 0 || Number(v.price_per_night) > 99999999.99) fail(400, 'Enter a valid non-negative price');
  const price_per_night = Math.round(Number(v.price_per_night) * 100) / 100;
  const description = text(v.description, 'Description', 5000, false);
  const amenities = text(v.amenities, 'Amenities', 2000, false);
  const status = v.status ?? 'available';
  if (!['available', 'occupied', 'cleaning', 'maintenance', 'out_of_service'].includes(status)) fail(400, 'Invalid room status');
  if (status === 'occupied' && previous.status !== 'occupied') fail(400,'Occupied status is controlled by check-in');
  return { name, type, capacity, price_per_night, description, amenities, status };
}
function roomNumber(value){if(value==null||value==='')return null;const result=text(value,'Room number',30).toUpperCase();if(!/^[A-Z0-9][A-Z0-9 ._-]*$/.test(result))fail(400,'Room number may contain letters, numbers, spaces, dots, underscores and hyphens');return result;}
module.exports = { fail, text, integer, date, dates, today, staff, room, roomNumber };
