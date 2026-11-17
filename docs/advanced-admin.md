# Advanced admin delivery — original UI

This implementation extends the original `frontend/src/App.jsx` and `pages/` views. It does not switch to `admin/AdminApp.jsx`, import `admin.css` / `classic.css`, replace the design system or install a UI framework. Original styles, 230px desktop sidebar, cream background, teal navigation, 170px room photos, cards, heading fonts, button styles, original header/bell SVG and the original four navigation entries remain. Authorized feature pages are appended to the sidebar; there is no More menu. Necessary responsive extensions and new panels are scoped in `src/features/features.css`.

## Existing architecture reused

React 18, Vite 6, plain CSS; Node/Express 4; MySQL/InnoDB with mysql2 parameterized queries; JWT/bcrypt authentication; database permissions; Socket.IO; TanStack Query and Recharts. Existing rooms, reservations, archived records, chat, guest offline queue, photo storage, payment operations, notifications and audit services remain in place. There are no new runtime dependencies.

Original entities: users, rooms, bookings, messages, push_subscriptions. Existing extensions: role/permission tables, gallery images, payment records/operations, notification inbox, maintenance requests, activity logs and resort settings. New work adds missing fields/history rather than creating duplicate business entities.

## Features and entry points

- Dashboard: total/available/occupied/maintenance rooms; total/pending/confirmed bookings; checked-in guests; today's arrivals/departures; total/monthly revenue, charts, recent stays/activity, upcoming stays and latest notifications. Values come from the database; no production fixture data is displayed.
- Rooms: original cards and Add/Edit form with room number, decimal pricing, amenities, operational status and image support. Details opens the existing gallery component for multiple photos, primary selection and removal. “Search and filter rooms” adds name/type/status/price/date filters and name/price sorting. Pagination starts above twelve matches. Existing archive/restore controls and historical associations remain. Occupied/cleaning today does not prohibit an otherwise non-overlapping future reservation. Operational Staff can mark a cleaned room ready through a backend readiness check.
- Bookings: original Active/Archived tabs/table remain. “Booking search and actions” adds creation and reference/guest/contact/status/date/room/account filters. Details includes payment balance, requests, creation and actual arrival/departure timestamps, audit history and modification of permitted dates/rooms. Existing Confirm/Decline/Cancel/Check-in/Check-out actions remain; eligible confirmed arrivals may be marked No Show. No Show cannot occur before arrival or transition back to checked in and releases the reservation interval.
- Calendar: separate page; month/week/day room timeline, previous/next/today, selected date, room/status filters, date indicators and details on selection. It uses existing system colors and no calendar dependency.
- Payments: cash/manual GCash/Maya/bank transfers; transaction/date/status search, electronic proof review, authorization-based verification/rejection, history, refunds and transaction receipts. Processing state (pending/submitted/verified/rejected/refund) is separate from derived pending/partially-paid/paid/failed/refunded settlement display. Existing idempotency and booking locks prevent duplicate processing and overpayment. Receipt PDF download and print use actual stored records, resort details and remaining balance. PHP code/symbol preference applies to printable receipt display.
- Guests: authorized profile search/status, permitted name/email/phone edits, current/past booking and payment history, with paginated history and preserved relationships. Passwords, hashes and token versions are excluded. Public registration still creates guests only.
- Users: original inline staff form/table remain. Expand staff tools for role search, edit/activation/deactivation, password reset and activity. Super Admin, Admin, Receptionist and Staff are supported; existing Housekeeping profiles remain compatible. New Staff uses the `operational_staff` permission profile. Sensitive role assignment remains Super Admin-only; the last active Super Admin cannot be removed/demoted.
- Bell: original appearance/position, unread count overlay, persistent dropdown/history, unread filter, read/all-read and related booking/room/payment details. Recipients are permission checked. Disabling a notification category suppresses new inbox alerts while retaining real-time data invalidation.
- Maintenance: issue creation, room selection, assignment, priorities, pending/in-progress/completed/cancelled workflow, filters, completion timestamp and history. Room locks serialize shutdown with booking creation. Staff cannot alter another assigned task. Final tasks cannot be silently reopened. Completion/cancellation releases maintenance readiness only if other open tasks, occupants and out-of-service restrictions permit it.
- Reports: original cards/containers remain; expand “Advanced reports and exports” for Today/This week/This month/This year/custom periods, actual receipts/refunds, bookings, cancellation rate, guest counts, room-night utilization, popular rooms and payment-method summaries. CSV, real OOXML `.xlsx`, and PDF exports use the selected range. Spreadsheet formulas are neutralized. The original “Revenue (confirmed and up)” remains explicitly booking value; advanced cash analytics is reported separately.
- Activity Logs: backend-generated login, room, booking, payment, staff/role, guest, settings and maintenance records with actor, action, entity, time and metadata; search/date filters and pagination. There is no staff edit/delete endpoint for audit history.
- Settings: database-backed resort name/description/contact/address, check-in/out times, policies, PHP display and notification categories. Times, lengths and preferences are validated. Guest booking forms show configured policy information. Policy text does not impose invented fees or silently rewrite existing booking dates/lifecycle rules.

## Data and concurrency

`migrate-advanced.js` adds nullable/unique room_number, widens booking status to include no_show, guest phone, maintenance workflow/priority/update fields and maintenance_history, and extended resort settings. Existing maintenance open/resolved status stays compatible; nullable workflow defaults are interpreted from it without rewriting historical rows. Permission grants add guest access and an operational Staff profile. Existing users are not automatically promoted and no table is dropped, truncated or reset.

Startup and `npm run migrate` run admin → platform → advanced migrations idempotently. MySQL DDL implicitly commits; take a deployment database backup and quiesce writes before production schema changes. Rollback should revert application code while retaining/exporting new financial/audit/history data; no destructive down migration is supplied.

Booking mutations lock rooms; reassignment locks rooms in stable ID order. Payment changes lock the booking/payment and use idempotency keys. Maintenance also locks its room before workflow changes. Check-in requires confirmation, stay dates, capacity and room readiness. Checkout requires settled balance and marks the room for cleaning. Guest queues are explicitly offline pending requests, not confirmed reservations or frontend-only operational records.

Financial recognition: verified payments are inflows on verification date; refund operations are negative on their own date, using Manila days. Archived history remains included; cancellation does not erase money received. Booking statistics use arrival dates. Reservation room-night utilization uses stay overlap for confirmed/checked-in/checked-out records and historical room inventory; it is distinct from the live actual-occupant dashboard count. Exports share the same aggregate function and date range as the UI.

## API additions

Existing `/api/rooms`, `/api/bookings`, `/api/users`, `/api/reports/summary`, `/api/admin/*` and `/api/ops/*` remain. The additive API uses bearer authentication, per-request database authorization, parameterized queries and `{error}` failures. See [advanced-contract.md](advanced-contract.md).

| Method | `/api/advanced` path | Permission / purpose |
|---|---|---|
| GET | `/dashboard` | `dashboard.view`; upcoming stays, checked-in guest count, scoped latest inbox |
| GET | `/guests` | `guests.view`; search/status and pagination |
| GET / PUT | `/guests/:id` | guest view/manage; histories / permitted profile edits |
| GET | `/bookings` | `bookings.view`; active/archive, guest, room, status and stay-date filters |
| GET | `/payments` | `payments.view`; processing/settlement state, date/search filters |
| GET | `/payments/:id/receipt.pdf` | `payments.view`; verified stored transaction PDF |
| GET / POST | `/maintenance` | `maintenance.manage`; scoped workflow list / issue creation |
| PATCH | `/maintenance/:id` | scoped assignee and transition validation |
| GET | `/maintenance/:id/history` | assigned/authorized history |
| GET | `/activity` | `activity.view`; read-only audit/search/date pagination |
| GET / PUT | `/settings` | settings view/manage |
| GET | `/policies` | authenticated guest-visible policy/contact fields only |
| GET | `/analytics` | `reports.view`; preset/custom range analytics |
| GET | `/analytics/export?format=csv\|xlsx\|pdf` | same filtered aggregate as analytics |

List page size is 20; responses use `{items,total,page,pages}`. Dates are `YYYY-MM-DD`; custom report ranges are inclusive and limited to ten years. Maintenance create/update accepts `room_id`, `description`, `priority`, `assigned_to`, `workflow_status` and boolean `mark_unavailable`. Existing payment writes retain their required `Idempotency-Key` header and audit trail.

## Files

New backend: `migrate-advanced.js`, `routes/advanced.js`, `lib/report-export.js`. Updated: migration runner/bootstrap, server route wiring and room handling, permissions, booking service, validation, realtime preferences, auth login auditing and existing ops/admin routes.

New frontend: `features/Pages.jsx`, `Notifications.jsx`, `live.js`, `features.css`. Extended original `App.jsx`, Rooms, Bookings, Users and Reports pages. Existing Calendar, Payments, Staff, LiveDashboard and shared query utilities are reused/extended. Original `styles.css` is unchanged; alternate AdminApp/theme styles are not used by the application.

Tests/contracts: `scripts/verify-advanced.cjs`, existing Postman read-only collection extended with guest/analytics/workflow/audit/settings checks, and advanced documentation. Earlier platform tests target a superseded alternate UI; the current `npm test` targets the original shell with the new features and retains their backend regression cases.

## Local commands

Configure the existing `backend/.env` using `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, a strong `JWT_SECRET` (minimum 24 characters), `CLIENT_ORIGIN` (comma-separated allowed origins), optionally `PORT` (4000), `NODE_ENV`, `SEED_DEMO=false`. Optional Web Push variables: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. `API_PROXY_TARGET` can override Vite's backend target. No payment gateway secrets are required.

From the repository root, for an **existing database**:

```powershell
npm --prefix backend run migrate
npm --prefix backend start
```

In another terminal:

```powershell
npm --prefix frontend run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173. Do not reimport schema.sql into the existing deployment. Demo seeding is opt-in outside production and must remain disabled for existing data.

First Super Admin provisioning remains explicit, using an existing active administrator:

```powershell
Set-Location backend
node bootstrap-super-admin.js existing-admin@example.com
```

Sign in again after provisioning. Normal Admin accounts can already manage operational rooms/bookings/payments/guests/reports; Settings and privileged role assignments require Super Admin.

## Verification and limits

```powershell
npm --prefix frontend run build
npm --prefix backend test
```

The integrated suite creates a uniquely named isolated MySQL database, starts separate API/Vite processes, checks concurrent bookings and maintenance shutdown, payment/refund idempotency, permissions, original UI dimensions/colors, live browser updates, forms, exports and all pages at 1440/820/390/320 px. It snapshots the existing application rows and never resets/drops databases. Test fixtures are retained for review. MySQL credentials require CREATE DATABASE permission. Playwright uses Chromium or installed Windows Edge, with `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override. Screenshots, sample exports and results are in ignored `test-results/advanced/`. Node syntax checks and `git diff --check` complement the build; the existing repository has no ESLint configuration.

Verified on 2026-11-11: **183 integrated API/browser checks passed**, plus **31 Postman assertions across 15 requests**. The frontend production build, Node syntax checks, and whitespace checks passed. The generated Excel workbook passed ZIP checksums and XML parsing. Browser runtime errors captured: none. The local migration was separately applied twice with an equality check confirming original values were preserved in ten existing business tables. Full suite fixtures: `resort_advanced_verify_1794406080989`.

Manual electronic payments are not gateway integrations; refunds record already-returned funds, not money transfers. Acknowledgments are not BIR official receipts. The dependency-free downloadable PDF uses a basic Latin font; the printable browser receipt retains browser font support. No email-delivered password reset, automatic cancellation fee engine, exchange-rate conversion, multi-node Socket.IO adapter or durable notification outbox is claimed. These deployment/provider capabilities need explicit configuration/integration. Existing bearer/localStorage token storage remains, with expiry/revocation and backend checks; deploy behind HTTPS and appropriate operational controls.
