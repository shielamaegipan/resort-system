# Integrated resort platform

## Architecture and scope

This extends the existing React 18 / Vite 6 frontend, Express 4 backend and MySQL/InnoDB database. No framework or UI library was replaced and no new runtime dependency was added. Existing bearer-JWT, bcrypt, Socket.IO, TanStack Query, Recharts, plain CSS, guest booking/PWA and chat code are reused. The existing admin workspace is now connected for authorized employees, with permission-filtered navigation and the original teal/serif visual identity in a light interface.

Original entities remain `users`, `rooms`, `bookings`, `messages`, `push_subscriptions`, and `admin_notifications`. Existing `/api/rooms`, `/api/bookings`, `/api/users`, and booking-value reports retain their response shapes. Staff room mutation privileges are intentionally tightened: Receptionists handle reservations and payments; managers handle inventory; Housekeeping handles room readiness. Existing Staff accounts map to Receptionist and existing Admin accounts map to Admin without rewriting their roles or password hashes.

## Implemented workflows

- Dashboard: ten database-backed counters, year-filtered verified-payment revenue, booking-status and room-occupancy charts, recent reservations and authorized audit activity. Dates use Asia/Manila. Current checked-in stays remain occupied even if overdue. Staff without financial access do not receive revenue values.
- Rooms: name/type/price/capacity/status/date filters, pagination, details, amenities, operational statuses, historical archiving/restoration and up to twelve gallery photos. The primary photo stays compatible with `rooms.image_url`. Files are limited to JPEG/PNG/WebP, 5 MB, validated for matching signatures and stored under generated names. Removal updates the primary photo and removes the unused stored file. Room category remains the existing editable `type` string; no duplicate category catalog is introduced.
- Bookings: month/week/day room timelines, date navigation, status filtering, booking details with payment balances and history, front-desk booking creation, date changes, room reassignment, special requests, confirmations/cancellation and check-in/out. Server-calculated totals cannot be supplied by clients. Existing pending-only guest cancellation policy remains.
- Check-in: confirmed reservation, valid stay dates, capacity, room readiness and no active occupant. Booking and room are changed in one transaction, with actor and timestamps. Payment policy permits payment during the stay; checkout requires the balance to be fully settled. Checkout marks the room Cleaning; an authorized room-readiness update releases it after cleaning. No unconfigured fees are fabricated.
- Notifications: authenticated Socket.IO, recipient-specific persisted inbox, unread counts, read/all-read, unread filter and links opening related records. Room, booking, payment and staff events are permission scoped. A one-minute job generates today's/tomorrow's arrival/departure reminders with stable event IDs, preventing duplicate daily reminders across restarts.
- Payments: cash, GCash, Maya and bank-transfer recording; electronic image evidence is private and reviewed manually. Verification, rejection with reason, full/partial refund records, idempotent retries, overpayment protection, transaction-reference uniqueness and append-only operation/audit history. Refund recording documents funds already returned outside this app; it does not transfer funds. Both the dashboard and main Reports view use verified payments less recorded refunds. The expandable historical report continues to show original booking value, explicitly labeled separately.
- Receipts: actual transaction/stay details, charges, payment, refunds, balance, resort contact settings and audit history. Print / Save as PDF uses the browser's print dialog. These are payment acknowledgments, not BIR official receipts.
- Staff: Admin, Super Admin, Receptionist and Housekeeping permission profiles; search/role/activity/status, account create/edit/activation/deactivation, last login, authorized password reset, immediate token-version revocation and last-active-Super-Admin protection. Assignment of privileged profiles requires Super Admin. Normal Admin can manage Receptionists. Housekeeping can report/resolve allowed maintenance tasks and update readiness. The API also supports assigning maintenance tasks to active employees.

## Database migrations and safety

`backend/migrate-all.js` runs the idempotent admin and platform migrations. The latter adds:

- User `permission_role`, `last_login_at`, `token_version`.
- Booking `special_requests`, actual check-in/out timestamps and responsible staff IDs.
- Expanded existing room-status enum: available, occupied, cleaning, maintenance, out_of_service.
- `permission_roles`, `role_permissions`, `room_images`, `activity_logs`, `payments`, `payment_operations`, `maintenance_records`, `resort_settings` with indexes and foreign keys.
- A unique payment-method/transaction-reference index, alongside global payment and payment-operation idempotency keys.

Existing user/room/booking rows are not seeded, reset, dropped or truncated. The old items migration no longer drops the legacy items table. Demo fixtures are explicitly opt-in using `SEED_DEMO=true` outside production; never enable this against an existing deployment. Additive migrations run during API startup and can also run explicitly. MySQL DDL implicitly commits: back up before a deployment and stop writes during schema changes. For rollback, restore application code while retaining new history tables and exporting added data; there is intentionally no destructive down migration that would erase financial records.

Reservation availability mutations serialize on room row locks; room reassignment locks both rooms in ID order. Booking and payment operations use transactions with READ COMMITTED, so a concurrent idempotent retry observes the committed operation after waiting for a lock. The server rechecks overlaps; the client is never the source of truth.

## API surface

All new endpoints below use `/api/ops`, bearer authentication and per-request database permissions. Failures use `{ "error": "..." }` with 400/401/403/404/409; unexpected server details are hidden. Payment writes require `Idempotency-Key`. See [platform-contract.md](platform-contract.md) for payload/behavior decisions. The runnable Postman regression collection is [admin-smoke.postman_collection.json](../postman/admin-smoke.postman_collection.json).

| Method | Path | Purpose / permission |
|---|---|---|
| GET | `/dashboard?year=YYYY` | Ten counters/charts; `dashboard.view` |
| GET | `/calendar?start=DATE&end=DATE` | At most 93 days of real stays; `bookings.view` |
| GET / PATCH | `/bookings/:id` | Detail/history; modify dates/room/requests; booking view/manage |
| GET / POST | `/payments` | Paginated ledger / record payment; payment view/record |
| GET | `/payments/:id` | Transaction and operation history; `payments.view` |
| POST | `/payments/:id/verify` | Independently verified funds; `payments.verify` |
| POST | `/payments/:id/reject` | Required rejection reason; `payments.verify` |
| POST | `/payments/:id/refund` | Amount/reason for recorded refund; `payments.refund` |
| GET | `/payments/:id/evidence` | Protected binary image; `payments.verify` |
| GET | `/payments/:id/receipt` | Verified acknowledgment data; `payments.view` |
| GET | `/roles` | Assignable profile catalog; `staff.manage` |
| GET / POST | `/staff` | Staff list/create; `staff.manage` |
| PUT | `/staff/:id` | Profile/account state; `roles.manage` for privileged profiles |
| POST | `/staff/:id/reset-password` | Administrator password reset; appropriate staff/role permission |
| GET | `/activity?type=users&id=ID` | Up to 100 authorized audit entries; `activity.view` |
| GET / POST | `/rooms/:id/images` | Gallery/list upload; room view/manage |
| PATCH / DELETE | `/rooms/:id/images/:imageId` | Primary image / remove; `rooms.manage` |
| PATCH | `/rooms/:id/operation` | Readiness; `rooms.operation` |
| GET / POST | `/maintenance` | Assigned/unassigned task list / issue reporting; `maintenance.manage` |
| PATCH | `/maintenance/:id` | Resolve allowed task; `maintenance.manage` |
| GET / PUT | `/settings` | Resort acknowledgment details; settings view/manage |

Payment list filters: `page`, `search`, `status`, `booking_id`; page size 20. Payment create body: `booking_id`, `amount` (positive, up to two decimal places), `method`, optional `notes`, required `transaction_reference` and base64 `evidence` for electronic methods. Payment creation returns `{id}`, with `replayed:true` for a successful retry. `verify` takes `{}`, `reject` requires `{reason}`, `refund` requires `{amount,reason}`. Reusing a key with different content is a conflict. References cannot be reused even after rejection; enter a new real provider reference for a new payment.

Legacy endpoint changes: `/api/auth/login` and `/me` now return profile/permissions without secrets. `/api/bookings` accepts permitted front-desk creation as well as guests; `/api/bookings/:id/status` validates readiness/dates/payment policy and records actual timestamps. Legacy room/users/messages APIs are also permission protected. Existing room photo upload now validates the file and retains gallery history. Account changes revoke existing API/chat/admin socket access.

## Synchronization and security

The `/admin` namespace authenticates tokens and current account state. Each event delivery checks the recipient's current permission profile. Successful writes persist recipient notifications and send unique `admin:change` events; clients deduplicate and invalidate TanStack Query caches. Reconnection refetches missed state; listeners/timers are cleaned up. Authenticated 30-second query refetching is the fallback when the socket is unavailable and also detects account access changes. `admin:read` synchronizes unread counts between sessions. No full-page data refresh is used.

JWT secret is required (minimum 24 configured characters); tokens expire after eight hours and carry a revocable account version. New platform staff and guest registrations require 12–72-character passwords; bcrypt hashes are retained for existing accounts. Public registration always creates guests. Login/register have per-IP rate limits. CORS uses an explicit configured origin allowlist. SQL uses parameters; image filenames are generated; evidence has no public static route. Responses suppress stack traces and send no-store/nosniff headers. Bearer authorization is explicitly attached, rather than ambient cookies; cookie-based CSRF tokens are therefore not used. Use HTTPS and a secured reverse proxy for deployment.

## Run locally (PowerShell, from repository root)

Existing database: configure the existing `backend/.env`; do **not** reimport schema.sql. For an entirely new database only, import schema.sql first.

```powershell
npm --prefix backend install
npm --prefix frontend install
npm --prefix backend run migrate
npm --prefix backend start
```

In another terminal:

```powershell
npm --prefix frontend run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173. Existing Admin accounts can use the platform immediately. To explicitly provision an existing administrator as the first Super Admin:

```powershell
Set-Location backend
node bootstrap-super-admin.js existing-admin@example.com
```

This is an explicit privileged operation that revokes that account's sessions; sign in again afterward. No administrator is automatically promoted. Configure resort name/contact on Settings after provisioning Super Admin.

Required backend environment names: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `CLIENT_ORIGIN` (comma-separated allowed origins), optionally `PORT` (4000), `NODE_ENV=production`, `SEED_DEMO=false`. Optional Web Push: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. `API_PROXY_TARGET` optionally overrides the frontend proxy target. Never commit .env or private evidence files.

## Verification and practical limits

### File map

New backend files: `backend/migrate-platform.js`, `backend/migrate-all.js`, `backend/bootstrap-super-admin.js`, `backend/routes/operations.js`, `backend/lib/permissions.js`, `backend/lib/uploads.js`, `backend/lib/reminders.js`.

Extended backend files: `backend/server.js`, `backend/middleware/auth.js`, `backend/routes/auth.js`, `backend/routes/admin.js`, `backend/lib/booking-service.js`, `backend/lib/validation.js`, `backend/lib/realtime.js`, `backend/package.json`, `backend/.env.example`, and `backend/migrate_items_to_resort.sql`. The pre-existing additive `backend/migrate-admin.js` is reused.

New frontend modules: `frontend/src/admin/LiveDashboard.jsx`, `Calendar.jsx`, `NewBooking.jsx`, `Payments.jsx`, `Staff.jsx`, `Operations.jsx`, and `RoomExtras.jsx`. Extended frontend modules: `frontend/src/App.jsx`, `frontend/src/pages/Login.jsx`, and the existing `frontend/src/admin/AdminApp.jsx`, `Rooms.jsx`, `Bookings.jsx`, `Overview.jsx`, `data.jsx`, `ui.jsx`, `admin.css`.

Other changes: `scripts/verify-platform.cjs`, `postman/admin-smoke.postman_collection.json`, `docs/platform-contract.md`, this guide, `.gitignore`, and the README. Existing unrelated working-tree changes were preserved.

```powershell
npm --prefix frontend run build
npm --prefix backend test
```

`scripts/verify-platform.cjs` creates a uniquely named isolated MySQL database, starts separate API/Vite processes, runs API/concurrency/permission/audit and real browser workflows, and checks snapshots proving existing application rows did not change. Database user needs CREATE DATABASE privileges. Test fixtures and artifacts remain for review; the suite never drops databases. It uses Playwright Chromium, falling back to installed Windows Edge; optionally set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Results/screenshots/PDF/Postman output go to `test-results/platform/`. The current suite supersedes the earlier `verify-admin.cjs` contract, which predates the new payment/readiness policies. There is no ESLint or unit-test runner configured in the existing frontend; build, Node syntax checks and the integrated suite are the configured evidence.

Verification on 2026-11-11: frontend production build passed; integrated suite passed 123 checks against `resort_platform_verify_1794398776515`; Postman executed ten requests and 22 assertions with zero failures. Browser checks cover 1440, 820, 390 and 320 px, real cross-session updates, calendar views, room/booking/staff/payment forms, payment validation errors, error recovery and a generated receipt PDF. No browser runtime errors were captured. Node syntax checks and `git diff --check` passed. The local application migration was separately applied twice with an equality check proving all original selected user, room, booking, message and subscription values were preserved. Postman's collection lint reported zero scanned requests for this legacy v2 export, so the actual collection execution—not that lint output—is the contract verification evidence. Postman cloud publishing is not configured or needed for these local checks.

GCash/Maya/bank transfers have no provider gateway integration. PDF download uses browser Save as PDF. There is no email-based self-service password recovery, BIR compliance, automatic refund transfer, tax engine, or dedicated category catalog. The current single-node notification transport/reminder job is appropriate for this existing deployment; multi-node production deployment needs a shared Socket.IO adapter, durable retry/outbox delivery and distributed rate limiting. Upload validation checks type/signature/size; malware scanning and image transcoding services are not integrated. Backups, HTTPS, operational monitoring and deployment configuration remain infrastructure responsibilities.
