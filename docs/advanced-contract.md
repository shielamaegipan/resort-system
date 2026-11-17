# Advanced extensions contract

Keep the original `App.jsx` layout, `styles.css`, room cards, staff form, booking tabs, report containers and bell. Add employee navigation/buttons in the same existing styles; do not switch to `AdminApp` or import its design CSS. Reuse existing service/permission/payment/notification logic.

New `/api/advanced` operations use bearer authentication and `{error}` failures. Lists use `{items,total,page,pages}` (20 records/page), validated filters and parameterized SQL. Guest view/manage permissions are separate. No secrets/password hashes appear in guest responses. Staff's operational role is exposed as `operational_staff` while existing `housekeeping` profiles remain compatible.

Operations: `GET /guests`, `GET/PUT /guests/:id`, `GET /maintenance`, `POST /maintenance`, `PATCH /maintenance/:id`, `GET /activity`, `GET/PUT /settings`, `GET /analytics`, `GET /analytics/export?format=csv|xlsx|pdf`, `GET /dashboard`, `GET /bookings`, `GET /payments`. New room number field is optional, normalized, unique and unrelated to the immutable room primary key. No Show is only allowed for eligible confirmed reservations on/after arrival date; it releases reserved dates and remains in history.

Maintenance keeps legacy open/resolved storage for old consumers, adds an explicit pending/in_progress/completed/cancelled workflow and history, and locks the room before changing readiness. Taking a room out of service is refused while active stays conflict. Completion releases a room only when no other maintenance task, active occupant or explicit out-of-service restriction prevents it. Employees can only update permitted assigned/unassigned tasks; managers assign staff and set priority.

Analytics recognition: verified payment events are cash inflows on verification date; refunds are negative flows on refund-operation date. Manila dates apply. Archived records remain in financial history; cancelled/no-show reservations are reported separately. Occupancy is booked room-nights in the selected stay range divided by the historical room inventory available for each day; checked-out history is included. Daily/weekly/monthly/yearly presets and inclusive custom ranges must produce the same totals as exports. CSV cells are formula-safe; XLSX uses string cells; PDFs are acknowledgments/reports, never government-certified official receipts. No gateway processing is claimed.

Settings validate operational times, policies and notification preferences. PHP is the supported accounting currency, with configurable code/symbol display; no currency conversion is fabricated. Policy text does not silently impose new charges or override existing booking lifecycle rules. New settings/audit/maintenance mutations are transactional, audited and notify authorized recipients.

Migrations only add columns/tables/indexes or widen enums. No existing role/account is automatically promoted or overwritten; first Super Admin provisioning stays explicit.
