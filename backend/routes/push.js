const express = require('express');
const webpush = require('web-push');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
let enabled = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:you@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    enabled = true;
  } catch (e) {
    // A bad key must not stop the whole server
    console.warn('VAPID keys are invalid, push notifications are disabled:', e.message);
  }
} else {
  console.warn('VAPID keys missing: push notifications are disabled');
}

router.get('/key', (req, res) => res.json({ publicKey: enabled ? VAPID_PUBLIC_KEY : '' }));

router.post('/status', auth, async (req, res) => {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
  const [[row]] = await db.query('SELECT COUNT(*) subscriptions FROM push_subscriptions WHERE user_id=? AND endpoint=?', [req.user.id, endpoint]);
  res.json({ configured: enabled, subscribed: Number(row.subscriptions) > 0 });
});

const testRequests = new Map();
router.post('/test', auth, async (req, res) => {
  if (!enabled) return res.status(503).json({ error: 'Push is not configured on the server. Contact the administrator.' });
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
  const [[subscription]] = await db.query('SELECT * FROM push_subscriptions WHERE user_id=? AND endpoint=?', [req.user.id, endpoint]);
  if (!subscription) return res.status(404).json({ error: 'Enable push notifications on this device first.' });
  const now = Date.now();
  for (const [id, expires] of testRequests) if (expires <= now) testRequests.delete(id);
  if ((testRequests.get(req.user.id) || 0) > now) return res.status(429).json({ error: 'Wait 10 seconds before sending another test.' });
  testRequests.set(req.user.id, now + 10000);
  try {
    await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({
      title: 'Resort push notification', body: 'Push notifications are working. You can receive booking and chat alerts on this device.',
      tag: `push-test-${req.user.id}-${now}`, url: '/?notifications=1',
    }), { timeout: 5000, TTL: 60 });
    res.status(202).json({ accepted: true });
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      await db.query('DELETE FROM push_subscriptions WHERE id=? AND user_id=?', [subscription.id, req.user.id]);
      return res.status(410).json({ error: 'This device subscription expired. Enable push notifications again.' });
    }
    console.warn('Test push failed:', error.statusCode || error.code || 'DELIVERY_ERROR');
    res.status(502).json({ error: 'The push service could not accept the test. Check your connection and server push keys, then try again.' });
  }
});

router.post('/subscribe', auth, async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error: 'Invalid subscription' });
  await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
    [req.user.id, endpoint, keys.p256dh, keys.auth]
  );
  res.json({ ok: true });
});

router.delete('/subscribe', auth, async (req, res) => {
  await db.query('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?', [req.user.id, String(req.body.endpoint || '')]);
  res.json({ ok: true });
});

// Send a push to everyone except the sender. Optional `roles` limits who receives it.
async function notify({ exceptUserId, roles, userIds, title, body, url = '/', tag }) {
  if (!enabled) return;
  if (userIds && !userIds.length) return;
  let sql = `SELECT ps.* FROM push_subscriptions ps JOIN users u ON u.id = ps.user_id
             WHERE u.deleted_at IS NULL AND ps.user_id <> ?`;
  const params = [exceptUserId || 0];
  if (roles && roles.length) { sql += ` AND u.role IN (${roles.map(() => '?').join(',')})`; params.push(...roles); }
  if (userIds) { sql += ` AND ps.user_id IN (${userIds.map(() => '?').join(',')})`; params.push(...userIds); }
  const [subs] = await db.query(sql, params);
  const payload = JSON.stringify({ title, body, url, tag });
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { timeout: 5000, TTL: 3600 });
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await db.query('DELETE FROM push_subscriptions WHERE id = ?', [s.id]);
      else console.warn('Push delivery failed:', e.statusCode || e.code || e.message);
    }
  }));
}

module.exports = { router, notify };
