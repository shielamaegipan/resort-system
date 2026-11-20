# Notification setup and verification

The current `feature/guest/notifications` working tree supports persistent inboxes and authenticated live updates for guests and employees. Guest booking/payment notices go to the booking owner; shared chat notices go to guests, receptionists, admins, and super admins other than the sender. Employee operational notices remain permission-scoped.

## Run locally

1. Restart the existing backend terminal with `npm --prefix backend start` (stop its previous process first).
2. Open the frontend, sign in, and open Notifications.
3. Push setup starts automatically after login. Allow the browser permission prompt once; later logins and reconnections restore push without prompting when permission is already granted. If the browser blocks an automatic permission prompt, use **Enable push notifications** in the bell dropdown (employees) or Notifications page (guests). Blocked permission must be changed in browser site settings.
4. Use a separate staff session to confirm a guest booking. The owner should receive an unread inbox record without reloading. An unrelated guest must not receive that booking notice.

Use `npm --prefix backend run setup:push` to validate or generate keys in the ignored `backend/.env`. Do not commit the private key. Other deployments must configure their own environment keys and restart the backend. Use HTTPS outside localhost. The inbox and live socket updates do not require browser push permission.

Push setup keeps the Service Worker registration across Vite development refreshes and bypasses development fetch caching. Each role's notification view now shows device push status and a **Send test notification** button. Browser permission, operating-system settings, and a working push provider are still required for an actual background device alert. See [the complete push setup and merge guide](push-merge-guide.md).

## API and events

- `GET /api/notifications`: authenticated user's latest 100 inbox records plus unread count.
- `PATCH /api/notifications/read`: `{id}` marks an owned record read; `{}` marks all owned records read.
- `POST /api/push/subscribe`: associates a browser endpoint with the signed-in user.
- `DELETE /api/push/subscribe`: removes only the signed-in user's matching endpoint.
- `POST /api/push/status`: reports server configuration and whether `{endpoint}` belongs to this user.
- `POST /api/push/test`: submits a real test to this user's device endpoint; 202 means provider acceptance, 404 means no owned subscription, 410 means expired, and 429 means wait before retrying.
- Socket.IO `/notifications`: JWT-authenticated `notification:change` and `notification:read` events trigger refreshes. Reconnection and browser focus restore current state.
- Existing `/api/admin/notifications` and `/admin` events remain compatible.

Logout unsubscribes the browser device before clearing the login token. Expired endpoints are removed after push provider responses 404/410. Push errors do not roll back persisted bookings or inbox records.

## Verification

```powershell
npm --prefix frontend run build
npm --prefix backend test
node scripts/verify-notifications.cjs
node scripts/verify-push-client.cjs
```

The existing integration suite covers live owner-specific guest notices, inbox authorization, synchronized read state, device test authorization, development worker registration, guest UI interactions, receptionist chat notices, sender exclusion, and the existing operational regressions. It uses a separate test database and checks that the existing application's core records remain unchanged.

The standalone notification tests exercise scoped recipient selection, empty-recipient isolation, expiry cleanup, timeout configuration, payload tags, and Service Worker display behavior using local test doubles. They do **not** prove delivery through a real browser push provider or the operating system. Complete that last test on the intended device after granting permission.

## Hosted multi-device delivery

Booking creation and status changes notify the booking owner and staff with booking access. Shared chat now includes admins and super admins in history, sockets, inbox, and push recipients; housekeeping remains excluded. The sender receives no chat push. Every subscribed endpoint belonging to each recipient receives the event, so enabling one device does not replace another device.

Configure stable `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` on the backend host, run database migrations, build the frontend, and serve the app with HTTPS. Keep the private key in host secrets. Git merges do not transfer ignored `.env` keys. Enable notifications from the inbox on each device and use Send test notification. iPhone/iPad require a Home Screen web app (iOS/iPadOS 16.4+); see https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ . Browser/OS permission, network access, and background-delivery policies still apply; unsupported devices cannot be promised push delivery.

The current change restores manual enable and test buttons when browsers suppress automatic permission prompts. Local tests do not prove a notification has displayed on a hosted physical device.

Current validation: frontend production build, notification tests, push client tests, and `node scripts/verify-chat-notifications.cjs` passed. Full database integration could not run because MySQL at 127.0.0.1:3306 was unavailable. Hosted physical-device delivery remains unverified.
