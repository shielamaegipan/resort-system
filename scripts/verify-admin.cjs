// Real MySQL + Express + Vite + browser verification in a NEW isolated database.
// Does not reset/drop a database or modify existing application rows or secrets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(root, 'backend/package.json'));
const frontendRequire = createRequire(path.join(root, 'frontend/package.json'));
backendRequire('dotenv').config({ path: path.join(root, 'backend/.env') });
const mysql = backendRequire('mysql2/promise');
const { io } = frontendRequire('socket.io-client');
const { chromium } = frontendRequire('@playwright/test');
const database = `resort_admin_verify_${Date.now()}`;
const apiBase = 'http://127.0.0.1:4100';
const uiBase = 'http://127.0.0.1:5180';
const processes = [], sockets = [];
const artifacts = path.join(root, 'test-results/admin');
let browser, connection;
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; console.log(`PASS ${message}`); }
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function start(file, args, cwd, env = {}) {
  const child = spawn(process.execPath, [file, ...args], { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.on('error', (error) => console.error(error.message));
  let log = '';
  child.stdout.on('data', (chunk) => { log += chunk; });
  child.stderr.on('data', (chunk) => { log += chunk; });
  child.log = () => log;
  processes.push(child);
  return child;
}
async function waitFor(fn, message, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { if (await fn()) return; } catch {} await delay(150); }
  throw new Error(`Timed out: ${message}\n${processes.map((p) => p.log()).join('\n')}`);
}
async function api(url, token, method = 'GET', body) {
  const response = await fetch(apiBase + '/api' + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}
async function login(email, password) { const response = await api('/auth/login', null, 'POST', { email, password }); assert.equal(response.status, 200); return response.data.token; }
function socketConnect(token) {
  const socket = io(apiBase + '/admin', { auth: { token }, reconnectionDelay: 100, transports: ['websocket'] });
  sockets.push(socket); return socket;
}
async function browserLogin(page, email = 'admin@resort.com', password = 'admin123') {
  await page.goto(uiBase, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
  await page.getByText('Live updates', { exact: true }).waitFor();
}
async function navigate(page, name) {
  if (await page.getByRole('button', { name: 'Open navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  await page.getByRole('heading', { name, exact: true }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
}
async function snapshot(dbName) {
  const result = {};
  for (const table of ['users', 'rooms', 'bookings', 'messages', 'push_subscriptions']) {
    const [rows] = await connection.query(`SELECT * FROM \`${dbName}\`.\`${table}\` ORDER BY id`);
    result[table] = JSON.stringify(rows);
  }
  return result;
}
async function main() {
  fs.mkdirSync(artifacts, { recursive: true });
  connection = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER, password: process.env.DB_PASSWORD, multipleStatements: true, dateStrings: true });
  const existingDb = process.env.DB_NAME;
  const before = await snapshot(existingDb);
  await connection.query(fs.readFileSync(path.join(root, 'backend/schema.sql'), 'utf8').replaceAll('resort_system', database));
  console.log(`Isolated verification database: ${database}`);
  start(path.join(root, 'backend/server.js'), [], path.join(root, 'backend'), { DB_NAME: database, PORT: '4100' });
  await waitFor(async () => (await api('/auth/login', null, 'POST', { email: 'admin@resort.com', password: 'admin123' })).status === 200, 'backend startup');
  start(path.join(root, 'frontend/node_modules/vite/bin/vite.js'), ['--host', '127.0.0.1', '--port', '5180', '--strictPort'], path.join(root, 'frontend'), { API_PROXY_TARGET: apiBase });
  await waitFor(async () => (await fetch(uiBase)).ok, 'Vite startup');
  const admin = await login('admin@resort.com', 'admin123');
  const guest = await login('guest@resort.com', 'guest123');
  const staff = await login('staff@resort.com', 'staff123');
  check((await api('/admin/reports')).status === 401, 'unauthenticated admin reports rejected');
  for (const token of [guest, staff]) {
    check((await api('/admin/reports', token)).status === 403, 'non-admin reports rejected');
    check((await api('/users', token, 'POST', { name: 'Forbidden', email: 'forbidden@example.com', password: 'test123' })).status === 403, 'non-admin staff management rejected');
    const s = socketConnect(token);
    await new Promise((resolve, reject) => { s.once('connect_error', () => resolve()); s.once('connect', () => reject(new Error('Unauthorized admin socket connected'))); });
    s.disconnect(); check(!s.connected, 'non-admin realtime subscription rejected');
  }
  const live = socketConnect(admin), events = [];
  live.on('admin:change', (event) => events.push(event));
  await waitFor(() => live.connected, 'admin socket connected');
  const roomPayload = { name: 'Verification suite', type: 'Suite', capacity: 3, price_per_night: 2200.5, description: 'Verification only', amenities: 'Wi-Fi, balcony', status: 'available' };
  let result = await api('/rooms', admin, 'POST', roomPayload);
  check(result.status === 201 && Number(result.data.price_per_night) === 2200.5, 'room creation preserves decimal pricing');
  const roomId = result.data.id;
  check((await api('/rooms', admin, 'POST', { ...roomPayload, capacity: 0 })).status === 400, 'invalid capacity rejected');
  result = await api(`/rooms/${roomId}`, admin, 'PUT', { name: 'Verification suite updated' });
  check(result.status === 200 && result.data.amenities === roomPayload.amenities, 'partial room update preserves amenities');
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=';
  check((await api(`/rooms/${roomId}/image`, admin, 'POST', { image })).status === 200, 'room image upload');
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const booking = { room_id: roomId, guest_name: 'Verification Guest', guest_contact: '09123456789', guests: 2, check_in: day(5), check_out: day(7), total_price: 1 };
  const attempts = await Promise.all([api('/bookings', guest, 'POST', booking), api('/bookings', guest, 'POST', booking)]);
  check(attempts.filter((r) => r.status === 201).length === 1 && attempts.filter((r) => r.status === 409).length === 1, 'simultaneous overlapping bookings: one succeeds, one conflicts');
  const bookingId = attempts.find((r) => r.status === 201).data.id;
  check(Number(attempts.find((r) => r.status === 201).data.total_price) === 4401, 'server calculates total and ignores client-submitted price');
  check((await api('/bookings', guest, 'POST', { ...booking, check_in: day(10), check_out: day(11), guests: 4 })).status === 400, 'guest count above room capacity rejected');
  check((await api('/bookings', guest, 'POST', { ...booking, check_in: '2026-02-30' })).status === 400, 'invalid calendar date rejected');
  check((await api('/bookings', guest, 'POST', { ...booking, guests: -1 })).status === 400, 'negative guest count rejected');
  result = await api(`/admin/rooms?check_in=${booking.check_in}&check_out=${booking.check_out}`, admin);
  check(!result.data.find((r) => r.id === roomId).available_for_dates, 'pending reservation removes date availability');
  check((await api(`/rooms/${roomId}`, admin, 'DELETE')).status === 409, 'room with active reservations cannot be archived');
  check((await api(`/bookings/${bookingId}`, admin, 'DELETE')).status === 409, 'active reservation cannot be archived');
  check((await api(`/bookings/${bookingId}/status`, admin, 'PATCH', { status: 'checked_out' })).status === 409, 'invalid status jump rejected');
  check((await api(`/bookings/${bookingId}/status`, guest, 'PATCH', { status: 'confirmed' })).status === 403, 'guest cannot confirm reservation');
  check((await api(`/bookings/${bookingId}/status`, admin, 'PATCH', { status: 'confirmed' })).status === 200, 'admin confirms booking');
  check((await api(`/bookings/${bookingId}/status`, guest, 'PATCH', { status: 'cancelled' })).status === 403, 'guest cannot cancel confirmed booking');
  for (const status of ['checked_in', 'checked_out']) check((await api(`/bookings/${bookingId}/status`, admin, 'PATCH', { status })).status === 200, `admin transitions to ${status}`);
  check((await api(`/bookings/${bookingId}`, admin, 'DELETE')).status === 200, 'completed booking archived');
  let report = (await api('/admin/reports', admin)).data;
  check(report.bookings === 1 && report.revenue === 4401, 'archived completed booking remains in report revenue');
  check((await api(`/bookings/${bookingId}/restore`, admin, 'POST')).status === 200, 'booking restored');
  const cancelled = await api('/bookings', guest, 'POST', { ...booking, check_in: day(10), check_out: day(11) });
  await api(`/bookings/${cancelled.data.id}/status`, admin, 'PATCH', { status: 'cancelled' });
  report = (await api('/admin/reports', admin)).data;
  check(report.bookings === 2 && Number(report.cancelled) === 1 && report.revenue === 4401, 'cancelled booking excluded from revenue without double counting');
  result = await api('/users', admin, 'POST', { name: 'Verification Staff', email: 'verification@example.com', password: 'test123' });
  const userId = result.data.id;
  check(result.status === 201 && !('password_hash' in result.data), 'staff account created without exposing password hash');
  check((await api('/users', admin, 'POST', { name: 'Duplicate', email: 'verification@example.com', password: 'test123' })).status === 409, 'duplicate staff email rejected');
  const staffToken = await login('verification@example.com', 'test123');
  const staffChat = io(apiBase, { auth: { token: staffToken }, transports: ['websocket'] });
  sockets.push(staffChat);
  await waitFor(() => staffChat.connected, 'staff chat connected');
  check((await api(`/admin/users/${userId}`, admin, 'PUT', { name: 'Edited Staff', email: 'verification-edited@example.com' })).status === 200, 'staff details edited without password reset');
  check((await api(`/users/${userId}`, admin, 'DELETE')).status === 200, 'staff deactivated');
  check((await api('/auth/me', staffToken)).status === 401, 'existing token loses API access on deactivation');
  await waitFor(() => !staffChat.connected, 'staff chat disconnected after deactivation');
  check(!staffChat.connected, 'deactivation revokes the existing staff chat connection');
  check((await api(`/admin/users/${userId}/restore`, admin, 'POST')).status === 200, 'staff reactivated');
  check((await api('/admin/users', admin)).data.every((u) => !('password_hash' in u)), 'staff list contains no hashes');
  check((await api('/users', admin, 'POST', { name: 'Invalid email', email: 'invalid', password: 'test123' })).status === 400, 'invalid staff email rejected');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
  const occupiedBooking = await api('/bookings', guest, 'POST', { ...booking, room_id: 1, check_in: today, check_out: tomorrow });
  assert.equal(occupiedBooking.status, 201);
  await api(`/bookings/${occupiedBooking.data.id}/status`, admin, 'PATCH', { status: 'confirmed' });
  await api(`/bookings/${occupiedBooking.data.id}/status`, admin, 'PATCH', { status: 'checked_in' });
  report = (await api('/admin/reports', admin)).data;
  check(report.occupied_today === 1 && Number(report.rooms.available) === Number(report.rooms.total) - 1, 'occupied and available room counts use real stays in Manila time');
  const rangeReport = (await api(`/admin/reports?start=${booking.check_in}&end=${booking.check_in}`, admin)).data;
  check(rangeReport.bookings === 1 && rangeReport.revenue === 4401, 'report date range filters by check-in date');
  check(report.monthly.reduce((sum, month) => sum + month.bookings, 0) === report.bookings && report.monthly.reduce((sum, month) => sum + month.revenue, 0) === report.revenue, 'monthly booking and revenue totals reconcile');
  const [anotherAdmin] = await connection.query(`INSERT INTO \`${database}\`.users (name,email,password_hash,role) SELECT 'Second Admin','second-admin@example.com',password_hash,'admin' FROM \`${database}\`.users WHERE email='admin@resort.com'`);
  const otherAdmin = await login('second-admin@example.com', 'admin123');
  check((await api(`/rooms/${roomId}`, admin, 'DELETE')).status === 200, 'room archived after reservations complete');
  check((await api(`/rooms/${roomId}/restore`, admin, 'POST')).status === 200, 'room restored');
  await waitFor(() => events.some((e) => e.category === 'bookings') && events.some((e) => e.category === 'rooms') && events.some((e) => e.category === 'users'), 'all realtime categories received');
  check(new Set(events.map((e) => e.id)).size === events.length, 'realtime event IDs are unique');
  check((await api('/admin/notifications', admin)).data.unread > 0, 'admin notifications persisted');
  const otherInbox = (await api('/admin/notifications', otherAdmin)).data;
  check(otherInbox.items.length > 0 && otherInbox.items.every((n) => n.user_id === anotherAdmin.insertId), 'notification inbox is scoped to the authenticated admin');
  const privateId = otherInbox.items[0].id;
  await api('/admin/notifications/read', admin, 'PATCH', { id: privateId });
  check((await api('/admin/notifications', otherAdmin)).data.items.find((n) => n.id === privateId).read_at === null, 'one admin cannot mark another admin notification read');
  await api('/admin/notifications/read', admin, 'PATCH', {});
  check((await api('/admin/notifications', admin)).data.unread === 0, 'mark all notifications read persists');
  const eventsBefore = events.length;
  await api('/rooms', admin, 'POST', { ...roomPayload, capacity: -2 });
  await delay(150);
  check(events.length === eventsBefore, 'failed writes emit no realtime event');
  // Create enough legitimate test bookings to exercise server-side pagination.
  for (let i = 0; i < 12; i++) {
    const extra = await api('/bookings', guest, 'POST', { ...booking, guest_name: `Pagination Guest ${i}`, check_in: day(30 + i * 2), check_out: day(31 + i * 2) });
    assert.equal(extra.status, 201);
  }
  const pageOne = (await api('/admin/bookings?page=1&search=Pagination', admin)).data;
  const pageTwo = (await api('/admin/bookings?page=2&search=Pagination', admin)).data;
  check(pageOne.total === 12 && pageOne.items.length === 10 && pageTwo.items.length === 2 && !pageOne.items.some((b) => pageTwo.items.some((next) => next.id === b.id)), 'server-side booking pagination and search return distinct pages');
  browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true } : { headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const secondContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const p1 = await context.newPage(), p2 = await secondContext.newPage();
  const errors = [];
  for (const p of [p1, p2]) p.on('pageerror', (error) => errors.push(error.message));
  await browserLogin(p1); await browserLogin(p2);
  await p1.screenshot({ path: path.join(artifacts, 'dashboard-desktop.png'), fullPage: true });
  await navigate(p1, 'Rooms'); await navigate(p2, 'Rooms');
  await p1.getByRole('button', { name: 'Add room', exact: true }).click();
  const dialog = p1.getByRole('dialog');
  await dialog.getByLabel('Room name', { exact: true }).fill('Two session room');
  await dialog.getByLabel('Price per night (PHP)').fill('3210');
  await dialog.getByLabel('Amenities').fill('Wi-Fi, garden view');
  const photo = await p1.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 20; canvas.height = 20; canvas.getContext('2d').fillRect(0, 0, 20, 20); return canvas.toDataURL('image/png').split(',')[1]; });
  await dialog.getByLabel('Room photo', { exact: true }).setInputFiles({ name: 'verification.png', mimeType: 'image/png', buffer: Buffer.from(photo, 'base64') });
  await dialog.getByRole('img', { name: 'Room photo preview' }).waitFor();
  await dialog.getByRole('button', { name: 'Save room', exact: true }).click();
  await p2.getByRole('heading', { name: 'Two session room', exact: true }).waitFor();
  check(true, 'room creation in first browser updates second browser without refresh');
  await waitFor(async () => p2.getByRole('img', { name: 'Two session room', exact: true }).evaluate((image) => image.naturalWidth > 0), 'uploaded room image decoded');
  check(true, 'browser room photo preview, optimization, upload and display');
  let uiRoom = (await api('/rooms', admin)).data.find((r) => r.name === 'Two session room');
  const card = p1.locator('article').filter({ has: p1.getByRole('heading', { name: 'Two session room', exact: true }) });
  await card.getByRole('button', { name: 'Edit room', exact: true }).click();
  await p1.getByRole('dialog').getByLabel('Room name', { exact: true }).fill('Two session edited');
  await p1.getByRole('dialog').getByRole('button', { name: 'Save room', exact: true }).click();
  await p2.getByRole('heading', { name: 'Two session edited', exact: true }).waitFor();
  check(true, 'room edit synchronizes across browser sessions');
  await navigate(p2, 'Bookings');
  const browserBooking = await api('/bookings', guest, 'POST', { ...booking, room_id: uiRoom.id, guest_name: 'Live booking guest', check_in: day(15), check_out: day(16) });
  await p2.getByRole('button', { name: 'Live booking guest', exact: true }).waitFor();
  check(true, 'new guest booking appears live in admin browser');
  const bookingRow = p2.locator('tr').filter({ has: p2.getByRole('button', { name: 'Live booking guest', exact: true }) });
  await bookingRow.getByRole('button', { name: 'Confirm', exact: true }).click();
  await p2.getByRole('dialog').getByRole('button', { name: 'Confirmed', exact: true }).click();
  await bookingRow.getByText('Confirmed', { exact: true }).waitFor();
  await bookingRow.getByRole('button', { name: 'Cancel', exact: true }).click();
  await p2.getByRole('dialog').getByRole('button', { name: 'Cancel booking', exact: true }).click();
  await bookingRow.getByText('Cancelled', { exact: true }).waitFor();
  check(true, 'admin browser confirms and cancels bookings with confirmation dialogs');
  await navigate(p2, 'Rooms');
  const editedCard = p1.locator('article').filter({ has: p1.getByRole('heading', { name: 'Two session edited', exact: true }) });
  await editedCard.getByRole('button', { name: 'Archive', exact: true }).click();
  await p1.getByRole('dialog').getByRole('button', { name: 'Archive room', exact: true }).click();
  await p2.getByRole('heading', { name: 'Two session edited', exact: true }).waitFor({ state: 'hidden' });
  await p1.getByRole('button', { name: 'Archived', exact: true }).click();
  await p1.locator('article').filter({ has: p1.getByRole('heading', { name: 'Two session edited', exact: true }) }).getByRole('button', { name: 'Restore room', exact: true }).click();
  await p2.getByRole('heading', { name: 'Two session edited', exact: true }).waitFor();
  await p1.getByRole('button', { name: 'Active rooms', exact: true }).click();
  check(true, 'browser room archive and restore synchronize across sessions');
  await navigate(p2, 'Dashboard');
  await secondContext.setOffline(true);
  await p2.getByText('Reconnecting…', { exact: true }).waitFor();
  await api('/rooms', admin, 'POST', { ...roomPayload, name: 'Created while offline' });
  await secondContext.setOffline(false);
  await p2.getByText('Live updates', { exact: true }).waitFor({ timeout: 15000 });
  const reconnectedReport = (await api('/admin/reports', admin)).data;
  await p2.locator('.admin-stat').filter({ hasText: 'Occupied today' }).getByText(`1 / ${reconnectedReport.rooms.total}`, { exact: true }).waitFor();
  check(true, 'mounted dashboard refetches a missed room update after reconnection');
  await navigate(p2, 'Rooms');
  await p2.getByRole('heading', { name: 'Created while offline', exact: true }).waitFor();
  check(true, 'websocket reconnect restores live state and refetches missed data');
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 820, height: 1180 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    await p1.setViewportSize(viewport);
    for (const pageName of ['Dashboard', 'Rooms', 'Bookings', 'Staff Accounts', 'Reports']) {
      await navigate(p1, pageName);
      await p1.waitForFunction(() => document.querySelectorAll('.admin-skeleton').length === 0);
      await delay(200);
      check(await p1.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${pageName} no page overflow at ${viewport.width}px`);
      if (pageName === 'Dashboard') await p1.screenshot({ path: path.join(artifacts, `dashboard-${viewport.width}.png`), fullPage: true });
    }
  }
  await p1.setViewportSize({ width: 1440, height: 1000 });
  await navigate(p1, 'Staff Accounts');
  await p1.getByRole('button', { name: 'Add staff', exact: true }).click();
  await p1.getByRole('dialog').getByLabel('Full name').fill('Browser Staff');
  await p1.getByRole('dialog').getByLabel('Email address').fill('browser-staff@example.com');
  await p1.getByRole('dialog').getByLabel('Password', { exact: true }).fill('test123');
  await p1.getByRole('dialog').getByRole('button', { name: 'Save staff', exact: true }).click();
  await p1.getByText('Browser Staff', { exact: true }).waitFor();
  check(true, 'staff creation through browser form');
  let staffRow = p1.locator('tr').filter({ has: p1.getByText('Browser Staff', { exact: true }) });
  await staffRow.getByRole('button', { name: 'Edit staff', exact: true }).click();
  await p1.getByRole('dialog').getByLabel('Full name').fill('Browser Staff Edited');
  await p1.getByRole('dialog').getByRole('button', { name: 'Save staff', exact: true }).click();
  staffRow = p1.locator('tr').filter({ has: p1.getByText('Browser Staff Edited', { exact: true }) });
  await staffRow.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await p1.getByRole('dialog').getByRole('button', { name: 'Deactivate account', exact: true }).click();
  await p1.getByLabel('Account status').selectOption('inactive');
  await staffRow.getByRole('button', { name: 'Activate', exact: true }).click();
  await p1.getByLabel('Account status').selectOption('active');
  await staffRow.getByText('Active', { exact: true }).waitFor();
  check(true, 'browser staff edit, deactivate and reactivate');
  await p1.getByRole('button', { name: /^Notifications/ }).click();
  await p1.getByRole('dialog').getByRole('button', { name: 'Mark all as read' }).click();
  await p1.getByRole('dialog').getByText('0 unread', { exact: true }).waitFor();
  check(true, 'browser notification panel and read state');
  check(errors.length === 0, `browser runtime errors: ${errors.join(', ') || 'none'}`);
  // Existing guest/staff screens remain reachable and do not acquire Admin navigation.
  for (const [email, password] of [['staff@resort.com', 'staff123'], ['guest@resort.com', 'guest123']]) {
    const p = await context.newPage();
    await p.goto(uiBase, { waitUntil: 'domcontentloaded' });
    await p.getByLabel('Email', { exact: true }).fill(email); await p.getByLabel('Password', { exact: true }).fill(password);
    await p.getByRole('button', { name: 'Log in', exact: true }).click();
    await p.getByRole('heading', { name: 'Rooms', exact: true }).waitFor();
    check(await p.locator('.admin-app').count() === 0, `${email.split('@')[0]} uses existing interface`);
    await p.close();
  }
  assert.deepEqual(await snapshot(existingDb), before);
  check(true, 'all pre-existing application rows remain unchanged');
  fs.writeFileSync(path.join(artifacts, 'summary.json'), JSON.stringify({ database, checks, passed: true, artifacts: 'test-results/admin', date: new Date().toISOString() }, null, 2));
  console.log(`VERIFIED ${checks} checks. Test fixtures retained in isolated database ${database}.`);
}
main().catch(async (error) => {
  console.error(error.stack);
  if (browser) for (const [i, context] of browser.contexts().entries()) for (const [j, page] of context.pages().entries()) {
    console.error('Browser state:', (await page.locator('body').innerText()).slice(0, 2000));
    await page.screenshot({ path: path.join(artifacts, `failure-${i}-${j}.png`), fullPage: true }).catch(() => {});
  }
  process.exitCode = 1;
}).finally(async () => {
  sockets.forEach((s) => s.disconnect());
  if (browser) await browser.close();
  for (const child of processes) child.kill();
  if (connection) await connection.end();
});
