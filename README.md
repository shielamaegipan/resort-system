# Resort System: Node.js + React + MySQL

Laman ng project:
- Node.js (Express) API + MySQL
- CRUD + Soft Delete / Archiving (`deleted_at`)
- Real-time chat gamit ang WebSocket (Socket.IO)
- Push Notification (Web Push / VAPID)
- PWA: offline Create Item + Background Sync (Service Worker + IndexedDB)
- React (Vite) frontend

## 1. Database
Buksan ang MySQL (XAMPP / MySQL Workbench) at i-run:
```
mysql -u root -p < backend/schema.sql
```

## 2. Backend
```
cd backend
npm install
cp .env.example .env        # (Windows: copy .env.example .env)
npx web-push generate-vapid-keys
```
Ilagay ang public/private key sa `.env`, i-edit din ang DB password.
```
npm run dev
```
API: http://localhost:4000

## 3. Frontend
```
cd frontend
npm install
cp .env.example .env        # ilagay ang VAPID public key
npm run dev
```
Buksan: http://localhost:5173

## Test ng PWA features
- **Offline sync:** Sa DevTools > Network, piliin ang "Offline", mag-add ng item (mase-save sa IndexedDB), tapos i-Online ulit. Awtomatikong mag-sy-sync.
- **Push:** I-click ang "Enable notifications". Makakatanggap ka ng push pag may bagong chat message mula sa ibang user, o pag nag-create ka ng item.
- Para makita ang "Install app", i-run ang `npm run build && npm run preview`.

## Struktura (para sa Git contributions)
Major: Whole UI, Chat + Notification, CRUD ng isang feature
Minor: Sidebar design, isang endpoint lang, login form, atbp.

Huwag kalimutang i-add si `noeldimailig` bilang collaborator sa GitHub repo.
