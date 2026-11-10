import { useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken, flushPending } from './api.js';
import { enablePush } from './push.js';
import Login from './pages/Login.jsx';
import Rooms from './pages/Rooms.jsx';
import Bookings from './pages/Bookings.jsx';
import Today from './pages/Today.jsx';
import Chat from './pages/Chat.jsx';
import Users from './pages/Users.jsx';
import Reports from './pages/Reports.jsx';

// What each role can see in the sidebar
const NAV = {
  admin: [['rooms', 'Rooms'], ['bookings', 'Bookings'], ['users', 'Users'], ['reports', 'Reports']],
  staff: [['rooms', 'Rooms'], ['bookings', 'Bookings'], ['today', 'Today'], ['chat', 'Chat']],
  guest: [['rooms', 'Rooms'], ['bookings', 'Bookings'], ['chat', 'Chat']],
};
const TITLES = { rooms: 'Rooms', bookings: 'Bookings', today: "Today's Check-in / Check-out", chat: 'Chat', users: 'Staff Accounts', reports: 'Reports' };
const ROLE_LABEL = { admin: 'Admin', staff: 'Staff', guest: 'Guest' };

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());
  const [page, setPage] = useState('rooms');
  const [toast, setToast] = useState('');
  const [headerAction, setHeaderAction] = useState(null);

  const notice = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); }, []);

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me').then(setUser).catch((e) => { if (e.status) setToken(null); }).finally(() => setReady(true));
  }, []);

  // Send bookings that were saved while offline
  useEffect(() => {
    if (!user) return;
    const run = async () => { const n = await flushPending(); if (n) { notice(`${n} offline booking(s) synced`); setPage('bookings'); } };
    run();
    window.addEventListener('online', run);
    const onMsg = (e) => e.data?.type === 'flush-bookings' && run();
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => { window.removeEventListener('online', run); navigator.serviceWorker?.removeEventListener('message', onMsg); };
  }, [user, notice]);

  if (!ready) return null;
  if (!user) return <Login onLogin={(u, t) => { setToken(t); setUser(u); setPage('rooms'); }} />;

  const logout = () => { setToken(null); setUser(null); };
  const items = NAV[user.role] || NAV.guest;
  const props = { user, notice, setHeaderAction };

  const bell = async () => {
    try { await enablePush(); notice('Notifications enabled'); } catch (e) { notice(e.message); }
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand"><img src="/icon.svg" alt="" width="34" height="34" /><span>Resort</span></div>
        <nav>
          {items.map(([key, label]) => (
            <button key={key} className={page === key ? 'active' : ''} onClick={() => { setHeaderAction(null); setPage(key); }}>{label}</button>
          ))}
        </nav>
        <div className="me">
          <strong>{user.name}</strong>
          {user.name.toLowerCase() !== ROLE_LABEL[user.role].toLowerCase() && <span>{ROLE_LABEL[user.role]}</span>}
          <button className="ghost-light" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="content">
        <header>
          <h1>{TITLES[page]}</h1>
          <div className="header-actions">
            {headerAction}
            <button className="bell" title="Enable notifications" onClick={bell} aria-label="Enable notifications">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>
            </button>
          </div>
        </header>
        {page === 'rooms' && <Rooms {...props} />}
        {page === 'bookings' && <Bookings {...props} />}
        {page === 'today' && user.role === 'staff' && <Today {...props} />}
        {page === 'chat' && user.role !== 'admin' && <Chat {...props} />}
        {page === 'users' && user.role === 'admin' && <Users {...props} />}
        {page === 'reports' && user.role === 'admin' && <Reports {...props} />}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
