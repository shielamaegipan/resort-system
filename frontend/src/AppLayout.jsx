import { useCallback, useEffect, useState } from 'react';
import * as API from './api.js';
import * as PUSH from './push.js';
import './layout.css';
import Login from './pages/Login.jsx';

/* Finds every page file by its name, so a missing page never crashes the app.
   (pages/admin/Name.jsx is preferred for the admin, then pages/Name.jsx) */
const pageModules = import.meta.glob('./pages/**/*.jsx', { eager: true });
const offlineModules = import.meta.glob('./offline.js', { eager: true });

const byName = {};
for (const [path, mod] of Object.entries(pageModules)) {
  const name = path.split('/').pop().replace('.jsx', '');
  const slot = path.includes('/pages/admin/') ? 'admin' : 'main';
  (byName[name] ||= {})[slot] = mod.default;
}
const findPage = (names, role) => {
  for (const n of names) {
    const e = byName[n];
    if (!e) continue;
    const c = (role === 'admin' && e.admin) || e.main || e.admin;
    if (c) return c;
  }
  return null;
};

// key, label, page file names to look for
const MENUS = {
  admin: [
    ['dashboard', 'Dashboard', ['AdminDashboard', 'Dashboard']],
    ['rooms', 'Rooms', ['AdminRooms', 'Rooms']],
    ['bookings', 'Bookings', ['AdminBookings', 'Bookings']],
    ['users', 'Users', ['Users', 'AdminUsers']],
    ['reports', 'Reports', ['Reports', 'AdminReports']],
  ],
  staff: [
    ['dashboard', 'Dashboard', ['StaffDashboard']],
    ['rooms', 'Rooms', ['Rooms']],
    ['availability', 'Room Availability', ['RoomAvailability']],
    ['bookings', 'Bookings', ['Bookings']],
    ['today', 'Check-in / Check-out', ['Today', 'CheckInOut', 'CheckInCheckOut']],
    ['guests', 'Guest Count', ['GuestCount']],
    ['payments', 'Cash Payments', ['CashPayments']],
    ['services', 'Services', ['Services']],
    ['chat', 'Chat', ['Chat']],
  ],
  guest: [
    ['home', 'Home', ['GuestHome']],
    ['about', 'About the Resort', ['AboutResort']],
    ['rooms', 'Rooms', ['GuestRooms', 'Rooms']],
    ['services', 'Services', ['GuestServices']],
    ['booking', 'Booking', ['BookRoom']],
    ['bookings', 'My Bookings', ['Bookings']],
    ['notifications', 'Notifications', ['GuestNotifications']],
    ['chat', 'Chat', ['Chat']],
  ],
};
const ROLE_LABEL = { admin: 'Admin', staff: 'Staff', guest: 'Guest' };

const ICONS = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  rooms: 'M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z',
  availability: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10z',
  bookings: 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM9 17H7v-2h2v2zm0-4H7v-2h2v2zm0-4H7V7h2v2zm8 8h-6v-2h6v2zm0-4h-6v-2h6v2zm0-4h-6V7h6v2z',
  today: 'M11 7L9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9 12h-8v2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-8v2h8v14z',
  guests: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  payments: 'M21 18v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1h-9a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h9zm-9-2h10V8H12v8zm4-2.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
  services: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  chat: 'M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z',
  reports: 'M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z',
};
ICONS.users = ICONS.guests;

const Icon = ({ name }) => (
  <svg className="shell-ico" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path fill="currentColor" d={ICONS[name] || ICONS.dashboard} />
  </svg>
);

const Bell = ({ onClick }) => (
  <button className="shell-bell" title="Enable notifications" aria-label="Enable notifications" onClick={onClick}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
  </button>
);

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('home');
  const [toast, setToast] = useState('');
  const [headerAction, setHeaderAction] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const notice = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); }, []);

  // Always start on the login page
  useEffect(() => { API.setToken?.(null); }, []);

  // Send bookings that were saved while offline
  useEffect(() => {
    if (!user) return;
    const flush = API.flushPending || Object.values(offlineModules)[0]?.flushPending;
    if (!flush) return;
    const run = async () => {
      try { const n = await flush(); if (n) { notice(`${n} offline booking(s) synced`); setPage('bookings'); } } catch { /* offline */ }
    };
    run();
    window.addEventListener('online', run);
    const onMsg = (e) => e.data?.type === 'flush-bookings' && run();
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => { window.removeEventListener('online', run); navigator.serviceWorker?.removeEventListener('message', onMsg); };
  }, [user, notice]);

  if (!user) {
    return <Login onLogin={(u, t) => { API.setToken(t); setUser(u); setPage(u.role === 'guest' ? 'home' : 'dashboard'); }} />;
  }

  const role = MENUS[user.role] ? user.role : 'guest';
  const items = MENUS[role].map(([key, label, names]) => ({ key, label, Comp: findPage(names, role) })).filter((i) => i.Comp);
  const current = items.find((i) => i.key === page) || items[0];

  const goTo = (key) => {
    if (!items.some((i) => i.key === key)) return;
    setHeaderAction(null); setMenuOpen(false); setPage(key);
  };
  const logout = () => { API.setToken(null); setUser(null); setMenuOpen(false); };
  const bell = async () => {
    try { await PUSH.enablePush(); notice('Notifications enabled'); } catch (e) { notice(e.message); }
  };
  const Page = current?.Comp;
  const pageEl = Page ? <Page user={user} notice={notice} goTo={goTo} setHeaderAction={setHeaderAction} /> : <p>Nothing to show.</p>;

  const brand = (
    <div className="shell-brand"><img src="/icon.svg" alt="" width="40" height="40" /><span>Resort</span></div>
  );

  /* ---------- Guest: menu on top ---------- */
  if (role === 'guest') {
    return (
      <div className="shell shell-top">
        <header className="top">
          <div className="top-in">
            {brand}
            <nav className="top-nav" aria-label="Main">
              {items.map((i) => (
                <button key={i.key} className={`top-link${current?.key === i.key ? ' on' : ''}`} aria-current={current?.key === i.key ? 'page' : undefined} onClick={() => goTo(i.key)}>{i.label}</button>
              ))}
            </nav>
            <div className="top-me">
              <strong>{user.name}</strong>
              <button className="shell-logout" onClick={logout}>Log out</button>
            </div>
          </div>
        </header>
        <div className="shell-body" role="main">
          <div className="shell-tools">{headerAction}<Bell onClick={bell} /></div>
          {pageEl}
        </div>
        {toast && <div className="shell-toast" role="status">{toast}</div>}
      </div>
    );
  }

  /* ---------- Admin and staff: menu on the left ---------- */
  return (
    <div className="shell shell-side">
      <aside className={`side${menuOpen ? ' open' : ''}`}>
        {brand}
        <nav className="side-nav" aria-label="Main">
          {items.map((i) => (
            <button key={i.key} className={`side-link${current?.key === i.key ? ' on' : ''}`} aria-current={current?.key === i.key ? 'page' : undefined} onClick={() => goTo(i.key)}>
              <Icon name={i.key} /><span>{i.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-me">
          <strong>{user.name}</strong>
          {user.name.toLowerCase() !== ROLE_LABEL[role].toLowerCase() && <span>{ROLE_LABEL[role]}</span>}
          <button className="side-logout" onClick={logout}>Log out</button>
        </div>
      </aside>
      {menuOpen && <div className="side-scrim" onClick={() => setMenuOpen(false)} />}
      <div className="shell-body" role="main">
        <div className="shell-head">
          <button className="burger" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <h1>{current?.label}</h1>
          <div className="head-actions">{headerAction}<Bell onClick={bell} /></div>
        </div>
        {pageEl}
      </div>
      {toast && <div className="shell-toast" role="status">{toast}</div>}
    </div>
  );
}
