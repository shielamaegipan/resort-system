# Notification setup and verification

The current `feature/guest/notifications` working tree supports persistent inboxes and authenticated live updates for guests and employees. Guest booking/payment notices go to the booking owner; shared chat notices go to guests and receptionists other than the sender. Employee operational notices remain permission-scoped.

## Run locally

1. Restart the existing backend terminal with `npm --prefix backend start` (stop its previous process first).
2. Open the frontend, sign in, and open Notifications.
3. Push setup starts automatically after login. Allow the browser permission prompt once; later logins and reconnections restore push without prompting when permission is already granted. If the browser blocks an automatic permission prompt, use **Enable push notifications** in the bell dropdown (employees) or Notifications page (guests). Blocked permission must be changed in browser site settings.
4. Use a separate staff session to confirm a guest booking. The owner should receive an unread inbox record without reloading. An unrelated guest must not receive that booking notice.

The ignored `backend/.env` now contains locally generated VAPID keys. Do not commit the private key. Other deployments must configure their own environment keys and restart the backend. Use HTTPS outside localhost. The inbox and live socket updates do not require browser push permission.

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

The integration suite passed 202 checks, including live owner-specific guest notices, inbox authorization, synchronized read state, device test authorization, development worker registration, guest UI interactions, receptionist chat notices, sender exclusion, and the existing operational regressions. It uses a separate test database and checks that the existing application's core records remain unchanged.

The standalone notification tests exercise scoped recipient selection, empty-recipient isolation, expiry cleanup, timeout configuration, payload tags, and Service Worker display behavior using local test doubles. They do **not** prove delivery through a real browser push provider or the operating system. Complete that last test on the intended device after granting permission.

## Branch scope

The latest browser-push improvements are implemented and tested in the current `feature/guest/notifications` working tree, ready for the user to commit, merge, and push. The previous notification fix was already merged into main, Ef-branch, and feature/admin/reports. Follow [the merge guide](push-merge-guide.md) to propagate this new change and update daculo-branch as well.
