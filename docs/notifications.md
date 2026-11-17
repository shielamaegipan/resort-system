# Notification setup and verification

The current `feature/guest/notifications` working tree supports persistent inboxes and authenticated live updates for guests and employees. Guest booking/payment notices go to the booking owner; shared chat notices go to guests and receptionists other than the sender. Employee operational notices remain permission-scoped.

## Run locally

1. Restart the existing backend terminal with `npm --prefix backend start` (stop its previous process first).
2. Open the frontend, sign in, and open Notifications.
3. Click **Enable push notifications** and allow notifications in the browser. Employees can enable push from the bell dropdown; guests can enable it from their Notifications page.
4. Use a separate staff session to confirm a guest booking. The owner should receive an unread inbox record without reloading. An unrelated guest must not receive that booking notice.

The ignored `backend/.env` now contains locally generated VAPID keys. Do not commit the private key. Other deployments must configure their own environment keys and restart the backend. Use HTTPS outside localhost. The inbox and live socket updates do not require browser push permission.

Push setup explicitly registers the Service Worker, including after Vite development startup removes an earlier registration. Browser permission, operating-system settings, and a working push provider are still required for an actual background device alert.

## API and events

- `GET /api/notifications`: authenticated user's latest 100 inbox records plus unread count.
- `PATCH /api/notifications/read`: `{id}` marks an owned record read; `{}` marks all owned records read.
- `POST /api/push/subscribe`: associates a browser endpoint with the signed-in user.
- `DELETE /api/push/subscribe`: removes only the signed-in user's matching endpoint.
- Socket.IO `/notifications`: JWT-authenticated `notification:change` and `notification:read` events trigger refreshes. Reconnection and browser focus restore current state.
- Existing `/api/admin/notifications` and `/admin` events remain compatible.

Logout unsubscribes the browser device before clearing the login token. Expired endpoints are removed after push provider responses 404/410. Push errors do not roll back persisted bookings or inbox records.

## Verification

```powershell
npm --prefix frontend run build
npm --prefix backend test
node scripts/verify-notifications.cjs
```

The integration suite passed 197 checks, including live owner-specific guest notices, inbox authorization, synchronized read state, guest UI interactions, receptionist chat notices, sender exclusion, and the existing operational regressions. It uses a separate test database and checks that the existing application's core records remain unchanged.

The standalone notification tests exercise scoped recipient selection, empty-recipient isolation, expiry cleanup, timeout configuration, payload tags, and Service Worker display behavior using local test doubles. They do **not** prove delivery through a real browser push provider or the operating system. Complete that last test on the intended device after granting permission.

## Branch scope

These changes are implemented and tested in the current working tree. The repository also contains older local and remote branch histories with different server and frontend architectures. They have been inspected but not overwritten, merged, or pushed. Clarify whether “all branches” means Git branches or all user roles before applying architecture-specific integrations to those histories.
