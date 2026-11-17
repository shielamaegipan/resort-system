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
              {i.label}
            </button>
          ))}
        </nav>
      </aside>
      {menuOpen && <div className="side-scrim" onClick={() => setMenuOpen(false)} />}
      <div className="side-main">
        <header className="side-top">
          <button className="burger" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <span className="who"><strong>{user.name}</strong>{user.name.toLowerCase() !== ROLE_LABEL[role].toLowerCase() && <span> · {ROLE_LABEL[role]}</span>}</span>
          <div className="side-top-actions">
            <Bell onClick={bell} />
            <button className="side-logout" onClick={logout}>Log out</button>
          </div>
        </header>
        <div className="shell-body" role="main">
          <div className="shell-head">
            <h1>{current?.label}</h1>
            <div className="head-actions">{headerAction}</div>
          </div>
          {pageEl}
        </div>
      </div>
      {toast && <div className="shell-toast" role="status">{toast}</div>}
    </div>
  );
}
