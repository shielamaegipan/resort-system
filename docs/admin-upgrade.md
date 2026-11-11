# Admin upgrade

This extends the existing React/Express/MySQL application. Staff and Guest page components and styles were not redesigned. Shared backend validation was tightened because bookings created by guests must safely reach Admin availability, reports, and notifications.

## Run locally

Start the existing MySQL/MariaDB service first. Keep the existing `backend/.env` and frontend environment files unchanged.

From the repository root:

```powershell
npm --prefix backend ci
npm --prefix frontend ci
npm --prefix backend run migrate
```

In one terminal:

```powershell
npm --prefix backend start
```

In a second terminal:

```powershell
npm --prefix frontend run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173 and use the existing Admin account. The original demo account is `admin@resort.com` / `admin123`; existing passwords are not reset by this upgrade. The backend also runs the additive migration before accepting requests. Only run `schema.sql` when installing a NEW database, as documented in the original README.

## Files and responsibilities

| Files | Responsibility |
| --- | --- |
| `frontend/src/admin/AdminApp.jsx`, `admin.css` | Admin-only layout, accessible mobile drawer, notification panel, theme |
| `frontend/src/admin/data.jsx`, `ui.jsx` | TanStack Query cache, authenticated Socket.IO connection, toast feedback, dialogs, pagination, loading/errors, error boundary |
| `frontend/src/admin/Overview.jsx` | Dashboard, date-filtered reports, Recharts charts |
| `frontend/src/admin/Rooms.jsx` | Search, filters, date availability, amenities, room/photo editing, archive/restore |
| `frontend/src/admin/Bookings.jsx` | Server-paginated booking list, details, status transitions, archive/restore |
| `frontend/src/admin/Users.jsx` | Staff create/edit, password changes, deactivate/reactivate |
| `frontend/src/App.jsx` | Select the Admin workspace after login; preserve existing Staff/Guest components |
| `backend/routes/admin.js` | New Admin-only endpoints without replacing existing response shapes |
| `backend/lib/booking-service.js`, `validation.js` | Transactional reservation rules and input validation |
| `backend/lib/realtime.js` | Separate `/admin` namespace and persistent recipient-scoped notifications |
| `backend/migrate-admin.js` | Additive/idempotent schema updates and InnoDB precondition |
| `backend/server.js`, `middleware/auth.js` | Integrate updates, route error handling, check current account status |
| `frontend/vite.config.js`, package manifests/locks | Compatible patched Vite, Admin dependencies, isolated test proxy |
| `scripts/verify-admin.cjs` | Real database/API/browser verification using an isolated database |
| `postman/admin-smoke.postman_collection.json` | Reusable read-only API smoke tests |

## API contracts

Existing routes and JSON shapes remain available. `rooms.amenities` is an additive string field. Prices retain two-decimal precision; startup no longer rounds existing prices or renames existing accounts.

Every new route below requires an authenticated active Admin:

| Method | Path under `/api` | Response / behavior |
| --- | --- | --- |
| GET | `/admin/rooms?check_in=YYYY-MM-DD&check_out=YYYY-MM-DD` | All rooms, including archives, with `available_for_dates`. Defaults to tonight in Manila. Supply both dates together. |
| GET | `/admin/bookings?page=1&search=&status=&archived=0` | `{items,total,page,pages}` with 10 rows/page, search, status and archive filtering |
| GET | `/admin/users` | Staff accounts, including `deleted_at`, excluding password hashes |
| PUT | `/admin/users/:id` | Edit `name`, `email`, optional `password`; role remains Staff |
| POST | `/admin/users/:id/restore` | Reactivate staff |
| GET | `/admin/reports?start=YYYY-MM-DD&end=YYYY-MM-DD` | Snapshot of booking totals, status counts, monthly series, rooms, accounts, recent bookings, occupancy |
| GET | `/admin/notifications` | `{items,unread}`; latest 100 notifications for the current recipient |
| PATCH | `/admin/notifications/read` | `{id}` marks own notification read; `{}` marks all own notifications read |

Validation errors return 400, missing records 404, conflicts 409, and unauthorized access 401/403. Existing room and booking mutation routes now enforce the same integrity rules for all callers.

## Reservation and accounting rules

- Pending, confirmed, and checked-in reservations block overlapping dates. Checkout is exclusive. Back-to-back stays are allowed.
- Booking creation locks the room row with `FOR UPDATE`; overlap validation and insert share the same transaction. Status updates, room edits, room archive, and reservation restore use the same lock order.
- Capacity must be a positive integer; guests cannot exceed room capacity. Invalid calendar dates and past booking check-ins are rejected. The server derives booking value from the current database room price, ignoring client-supplied prices.
- Status flow is `pending → confirmed → checked_in → checked_out`; pending/confirmed reservations may be cancelled. Guests may only cancel their own pending bookings. Admin and Staff retain their existing management roles.
- Only completed/cancelled bookings can be archived. Room archive/maintenance cannot strand active reservations. Archiving is reversible and never deletes a record.
- Admin revenue means confirmed + checked-in + checked-out booking value. Cancelled and pending bookings add no revenue. Archived completed history stays included. The original `/reports/summary` response remains available to existing consumers; the upgraded Admin uses `/admin/reports` with explicitly documented accounting.
- Report range filters apply to check-in dates. Monthly charts include the latest 12 months with records within the range. Operational room/account counts reflect the current state. Occupancy trend covers the last 14 Manila calendar days using confirmed/checked-in/checked-out stays. This is reservation value and occupancy history inferred from booking dates/status, not a payments ledger or an audited history of actual arrival times.

## Real-time behavior

Successful API writes publish an `admin:change` event with a unique ID, category, title, body, and entity ID after the database operation/transaction commits. Each active Admin receives a persistent inbox row. The client deduplicates IDs, batches invalidations, and refetches its queries. Reconnection and browser focus trigger refetches to cover missed events. Read state synchronizes between the recipient's sessions via `admin:read`.

Admin sockets are authenticated on the separate `/admin` namespace; Staff/Guest cannot subscribe. Access is rechecked before change delivery and sockets expire with their token. Existing chat uses the original namespace and events. UI states stay separated by role and the Admin query cache is discarded on logout.

The application runs as one Node process. Multiple API instances would require a shared Socket.IO adapter. Writes made directly in a SQL console do not publish application events; use the APIs. Notification insertion is best effort after a committed mutation; failures are logged, and notification persistence is not an atomic outbox. Browser Web Push remains optional and requires existing valid VAPID configuration; no keys were changed. In-app Admin notifications work without Web Push.

## Verification

```powershell
npm --prefix frontend run build
npm --prefix frontend audit
npm --prefix backend audit
```

Install Playwright's browser once if it is not already present:

```powershell
npm --prefix frontend exec -- playwright install chromium
node scripts/verify-admin.cjs
```

Alternatively set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed Chromium executable. The verification script needs permission to create a separate MySQL database. It creates a unique `resort_admin_verify_<timestamp>` database, runs the real API on 4100 and Vite on 5180, and stops those test processes afterwards. Fixtures remain only in that isolated database for review; it never drops databases or deletes pre-existing records. It compares all pre-existing application rows before/after the run. Screenshots and the successful result summary are written under ignored `test-results/admin/`.

Tests cover CRUD, image upload, booking capacity/dates/pricing/status policy, concurrent booking conflicts, report reconciliation, notification ownership, staff security, real-time updates across independent sessions, reconnect, all five Admin routes at 1440/820/390/320 pixels, and unchanged Staff/Guest entry screens.

Verified on 2026-11-11: 85 integration/browser checks passed against a separate test database, 15 Postman assertions passed across six read-only requests against the local application, production build passed, backend JavaScript syntax checks passed, and both dependency audits reported zero vulnerabilities. The existing application's Admin login and live socket were also checked in Chromium. All pre-existing rows in users, rooms, bookings, messages, and push subscriptions matched the pre-test snapshot. Test fixtures remain in `resort_admin_verify_1794395008997`; earlier verification runs also retained their own uniquely named databases.

Optional read-only Postman smoke run against the running local API:

```powershell
postman collection run postman/admin-smoke.postman_collection.json --env-var baseUrl=http://127.0.0.1:4000 --env-var adminEmail=admin@resort.com --env-var adminPassword=admin123 --no-report-events
```

Use the actual existing account credentials if different. The returned token stays in the runner's memory. No shared Postman workspace is required or published.

## Implementation references

Cache invalidation follows [TanStack Query guidance](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation); socket isolation follows [Socket.IO namespaces](https://socket.io/docs/v4/namespaces/) and [middleware authentication](https://socket.io/docs/v4/middlewares/). Charts use [Recharts accessibility support](https://github.com/recharts/recharts/blob/main/storybook/stories/API/Accessibility.mdx).
