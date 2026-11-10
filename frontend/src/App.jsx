import { useEffect, useState, useCallback } from 'react';
import { setToken, flushPending } from './api.js';
import { enablePush } from './push.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Rooms from './pages/Rooms.jsx';
import Bookings from './pages/Bookings.jsx';
import Today from './pages/Today.jsx';
import Chat from './pages/Chat.jsx';
import Users from './pages/Users.jsx';
import Reports from './pages/Reports.jsx';
import StaffDashboard from './pages/StaffDashboard.jsx';
import RoomAvailability from './pages/RoomAvailability.jsx';
import CashPayments from './pages/CashPayments.jsx';
import GuestCount from './pages/GuestCount.jsx';
import Services from './pages/Services.jsx';
import GuestHome from './pages/GuestHome.jsx';
import AboutResort from './pages/AboutResort.jsx';
import GuestServices from './pages/GuestServices.jsx';
import BookRoom from './pages/BookRoom.jsx';
import GuestNotifications from './pages/GuestNotifications.jsx';

// What each role can see in the sidebar
const NAV = {
  admin: [['dashboard', 'Dashboard'], ['rooms', 'Rooms'], ['bookings', 'Bookings'], ['users', 'Users'], ['reports', 'Reports']],
  staff: [
    ['dashboard', 'Dashboard'], ['rooms', 'Rooms'], ['availability', 'Room Availability'], ['bookings', 'Bookings'],
    ['today', 'Check-in / Check-out'], ['payments', 'Cash Payments'], ['guestcount', 'Guest Count'],
    ['services', 'Services'], ['chat', 'Chat'],
  ],
  guest: [
    ['home', 'Home'], ['about', 'About the Resort'], ['rooms', 'Rooms'], ['services', 'Services'],
    ['booking', 'Booking'], ['mybookings', 'My Bookings'], ['notifications', 'Notifications'], ['chat', 'Chat'],
  ],
};
const TITLES = {
  dashboard: 'Dashboard', rooms: 'Rooms', availability: 'Room Availability', bookings: 'Bookings',
  today: "Today's Check-in / Check-out", payments: 'Cash Payments', guestcount: 'Guest Count', services: 'Services',
  home: 'Home', about: 'About the Resort', booking: 'Book a Room', mybookings: 'My Bookings', notifications: 'Notifications',
  chat: 'Chat', users: 'Staff Accounts', reports: 'Reports',
};
const ROLE_LABEL = { admin: 'Admin', staff: 'Staff', guest: 'Guest' };
const homePage = (u) => (u?.role === 'admin' || u?.role === 'staff' ? 'dashboard' : 'home');

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('rooms');
  const [toast, setToast] = useState('');
  const [headerAction, setHeaderAction] = useState(null);

  const notice = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); }, []);

  // Always start at the login page: forget any saved session when the app is opened
  useEffect(() => { setToken(null); }, []);

  // Send bookings that were saved while offline
  useEffect(() => {
    if (!user) return;
    const run = async () => { const n = await flushPending(); if (n) { notice(`${n} offline booking(s) synced`); setPage(user.role === 'guest' ? 'mybookings' : 'bookings'); } };
    run();
    window.addEventListener('online', run);
    const onMsg = (e) => e.data?.type === 'flush-bookings' && run();
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => { window.removeEventListener('online', run); navigator.serviceWorker?.removeEventListener('message', onMsg); };
  }, [user, notice]);

  if (!user) return <Login onLogin={(u, t) => { setToken(t); setUser(u); setPage(homePage(u)); }} />;

  const logout = () => { setToken(null); setUser(null); };
  const items = NAV[user.role] || NAV.guest;
  const goTo = (key) => { setHeaderAction(null); setPage(user.role === 'guest' && key === 'bookings' ? 'mybookings' : key); };
  const props = { user, notice, setHeaderAction, goTo };
  const isStaff = user.role === 'staff';
  const isGuest = user.role === 'guest';

  // Guests: the bell opens the Notifications page.
  // Admin / staff: the bell still turns on push notifications (they have no Notifications page).
  const bell = async () => {
    if (isGuest) return goTo('notifications');
    try { await enablePush(); notice('Notifications enabled'); } catch (e) { notice(e.message); }
  };
  const bellLabel = isGuest ? 'Notifications' : 'Enable notifications';

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand"><img src="/icon.svg" alt="" width="34" height="34" /><span>Resort</span></div>
        <nav>
          {items.map(([key, label]) => (
            <button key={key} className={page === key ? 'active' : ''} onClick={() => goTo(key)}>{label}</button>
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
            <button className="bell" title={bellLabel} onClick={bell} aria-label={bellLabel}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>
            </button>
          </div>
        </header>
        {page === 'dashboard' && user.role === 'admin' && <Dashboard {...props} />}
        {page === 'dashboard' && isStaff && <StaffDashboard {...props} />}
        {page === 'rooms' && <Rooms {...props} />}
        {page === 'availability' && isStaff && <RoomAvailability {...props} />}
        {(page === 'bookings' || (page === 'mybookings' && isGuest)) && <Bookings {...props} />}
        {page === 'today' && isStaff && <Today {...props} />}
        {page === 'payments' && isStaff && <CashPayments {...props} />}
        {page === 'guestcount' && isStaff && <GuestCount {...props} />}
        {page === 'services' && isStaff && <Services {...props} />}
        {page === 'home' && isGuest && <GuestHome {...props} />}
        {page === 'about' && isGuest && <AboutResort {...props} />}
        {page === 'services' && isGuest && <GuestServices {...props} />}
        {page === 'booking' && isGuest && <BookRoom {...props} />}
        {page === 'notifications' && isGuest && <GuestNotifications {...props} />}
        {page === 'chat' && user.role !== 'admin' && <Chat {...props} />}
        {page === 'users' && user.role === 'admin' && <Users {...props} />}
        {page === 'reports' && user.role === 'admin' && <Reports {...props} />}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
