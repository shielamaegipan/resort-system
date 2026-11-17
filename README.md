# 🏝️ Resort Management System

Current advanced admin implementation and local commands: [Advanced admin — original UI](docs/advanced-admin.md). The original application shell, CSS and pages are retained, with authorized feature pages appended in the same style. This guide supersedes earlier alternate-workspace UI instructions below.

Integrated platform setup, permissions, payments, calendar, migrations and verification: [Platform upgrade guide](docs/platform-upgrade.md). This guide supersedes the legacy automatic-demo-account and staff-access notes below. Existing databases must not be reset or reimported.

A web-based **Resort Reservation and Management System** built with Node.js, React and MySQL. It makes it easy to manage rooms, guest bookings, and staff–guest communication, even offline.

The existing Admin workspace has been upgraded with responsive layouts, live updates, safe booking transactions, reports, staff management, and persistent notifications. See [Admin upgrade: setup, API contracts, verification, and limitations](docs/admin-upgrade.md).

## System Users

| Role | What they can do |
|------|------------------|
| **Admin** | Management and oversight: **Users** (create accounts, change roles, delete), **Reports** (revenue, occupancy, bookings per month), add / edit / delete rooms, view all bookings, **Archived** rooms and bookings with Restore. No chat. |
| **Staff** | Daily front-desk work: **Dashboard**, **Rooms** (add / edit / delete, set maintenance), **Room Availability** (per date), **Bookings** (confirm / decline), **Check-in / Check-out**, **Cash Payments**, **Guest Count**, **Services**, **Today** list, and **chat with guests**. |
| **Guest** | Register and log in, search rooms by dates and guests, book (works offline), view own bookings, **cancel only while the booking is still pending** (not after the staff confirms), chat with staff, get notifications. |

### Default accounts (created automatically when the backend starts)

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@resort.com` | `admin123` |
| Staff | `staff@resort.com` | `staff123` |
| Guest | `guest@resort.com` | `guest123` |

> ⚠️ For development only. Change these passwords before deploying.
> New registrations are automatically **guests**.

## Features

- **Rooms:** add / edit, plus room photos
- **Bookings:** double-booking check and statuses (pending / confirmed / checked-in / checked-out / cancelled)
- **Real-time chat** over WebSocket (Socket.IO) between staff and guests only
- **Push notifications** (Web Push / VAPID) for new bookings and new chat messages
- **PWA:** offline Create Booking + Background Sync (Service Worker + IndexedDB)
- **React (Vite)** frontend

## Tech Stack

| Part | Technology |
|------|------------|
| Frontend | React + Vite (PWA) |
| Backend | Node.js + Express |
| Database | MySQL |
| Real-time | Socket.IO |
| Notifications | Web Push (VAPID) |

## Installation

### 1. Database
Open MySQL (XAMPP / MySQL Workbench) and run:
```
mysql -u root -p < backend/schema.sql
```
(or import `backend/schema.sql` in phpMyAdmin)
```
```

### 2. Backend
```
cd backend
npm install
cp .env.example .env        # (Windows: copy .env.example .env)
npx web-push generate-vapid-keys
```
Put the public/private keys in `.env`, and also edit the DB password.
```
npm run dev
```
API: http://localhost:4000

### 3. Frontend
```
cd frontend
npm install
cp .env.example .env        # put the VAPID public key here
npm run dev
```
Open: http://localhost:5173

## App Pages

| Page | Admin | Staff | Guest |
|------|-------|-------|-------|
| Rooms | Add, edit, delete, archived + restore | Add, edit, delete | Search by date, book |
| Bookings | All, change status, archived + restore | All, change status | Own only; cancel while pending |
| Today | - | Yes | - |
| Users / Reports | Yes | - | - |
| Chat | - | Yes | Yes |

## Testing the PWA Features

- **Offline sync:** First open Rooms and Bookings while online. In DevTools > Network, choose "Offline", create a booking (it is saved in IndexedDB), then go back online. It syncs automatically.
- **Push:** Click "Enable notifications". You will receive a push when another user sends a chat message or when a new booking is made.
- To see the "Install app" option, run `npm run build && npm run preview`.

## Git Contribution Structure

- **Major:** Whole UI, Chat + Notifications, CRUD of one feature
- **Minor:** Sidebar design, a single endpoint, login form, etc.

## If you already have a database without the `role` column in users

Run `backend/migrate_add_roles.sql` (once only), then restart the backend.

## If you used the old version (with `items`)

Run `backend/migrate_items_to_resort.sql` in phpMyAdmin (SQL tab). It creates `rooms` and `bookings`. 5 sample rooms are added automatically when the backend starts.

## Room photo upload

Photos are resized in the browser before upload (see `frontend/src/utils/resizeImage.js`). The server accepts JPG, PNG and WEBP, and adds the `rooms.image_url` column automatically if it is missing.

## Project Structure

```
backend/
  server.js            API, rooms, bookings, chat (Socket.IO), seeds
  db.js                MySQL connection pool
  middleware/auth.js   JWT helpers
  routes/auth.js       register / login / me
  routes/push.js       Web Push subscribe + notify
  schema.sql           database schema
frontend/
  public/              sw.js (service worker), manifest.json, icon.svg
  src/                 App, pages (Login, Rooms, Bookings, Today, Chat, Users, Reports), api.js, db.js (IndexedDB), push.js
  src/utils/resizeImage.js   shrinks pictures before upload
```

## Room Photo Upload (fixed)

- Rooms > **Add room** or **Edit** > *Choose picture from this computer*.
- The picture is resized in the browser (max 1280px, JPEG) and then uploaded, so large laptop photos work.
- The server accepts JPG, PNG and WEBP up to 25 MB, shows clear error messages, and automatically adds the `rooms.image_url` column if it is missing (running `migrate_add_room_image.sql` is no longer required).
- Only **admin** and **staff** can upload pictures.

## Staff API (new)

All endpoints need a staff (or admin) login.

| Feature | Endpoint |
|---------|----------|
| Dashboard | `GET /api/staff/dashboard` |
| Room Availability | `GET /api/rooms/availability?date=YYYY-MM-DD` (available / reserved / occupied / maintenance) |
| Check-in | `POST /api/bookings/:id/check-in` (booking must be *confirmed* and the check-in date must have arrived) |
| Check-out | `POST /api/bookings/:id/check-out` (blocked if there is an unpaid balance, unless `{ "allow_unpaid": true }`) |
| Bill of a booking | `GET /api/bookings/:id/bill` (room + services - cash paid = balance) |
| Cash Payments | `POST /api/bookings/:id/payments` `{ amount, note }`, `GET /api/payments?date=YYYY-MM-DD` |
| Guest Count | `GET /api/guests/count?date=YYYY-MM-DD` (in-house, arriving, departing + list) |
| Services (catalog) | `GET / POST /api/services`, `PUT / DELETE /api/services/:id` |
| Services used by a guest | `POST /api/bookings/:id/services` `{ service_id, quantity }`, `DELETE /api/bookings/:id/services/:rowId` |

The new tables (`services`, `booking_services`, `payments`) are created automatically when the backend starts, and 6 sample services are seeded. They are also in `schema.sql` and `migrate_add_staff_features.sql`.

## Notes

- `.env` files are not included because they hold secret keys. Create `backend/.env` from `backend/.env.example` and set `JWT_SECRET` to a long random value.
- Generate your own VAPID keys with `npx web-push generate-vapid-keys`. The frontend reads the public key from the server, so `frontend/.env` is optional.

---

Don't forget to add `noeldimailig` as a collaborator on the GitHub repo.
