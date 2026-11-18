import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as API from './api.js';
import * as PUSH from './push.js';
import './layout.css';
import Login from './pages/Login.jsx';
import { AdminProvider } from './admin/data.jsx';
import { FeaturePage } from './features/Pages.jsx';
import Notifications, { EmployeeSync, NotificationRecord } from './features/Notifications.jsx';

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

// Permission needed for a page (only applied when the account has a permissions list)
const GATE = { rooms: 'rooms.view', bookings: 'bookings.manage', today: 'bookings.manage', users: 'staff.manage', reports: 'reports.view' };

// Extra pages from the Admin upgrade: shown only when the account has the permission
// and the page is not already in the menu above.
const EXTRA_NAV = [
  ['dashboard', 'Dashboard', 'dashboard.view'],
  ['calendar', 'Calendar', 'bookings.view'],
  ['payments', 'Payments', 'payments.view'],
  ['guests', 'Guests', 'guests.view'],
  ['maintenance', 'Maintenance', 'maintenance.manage'],
  ['activity', 'Activity Logs', 'activity.view'],
  ['settings', 'Settings', 'settings.manage'],
];

const Bell = ({ onClick, label = 'Enable notifications', expanded }) => (
  <button className="shell-bell" title={label} aria-label={label} aria-expanded={expanded} onClick={onClick}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
  </button>
);

/* Wraps the page for admin and staff. When the page already draws its own title that matches
   the shell title (for example "Dashboard"), the shell title is hidden so it is shown only once. */
function PageSlot({ label, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const slot = ref.current;
    const body = slot && slot.closest('.shell-body');
    if (!slot || !body) return undefined;
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const check = () => {
      const own = [...slot.querySelectorAll('h1, h2, h3')].filter((h) => !h.closest('.modal, [role="dialog"]'));
      body.classList.toggle('hide-shell-title', own.some((h) => norm(h.textContent) === norm(label)));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(slot, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); body.classList.remove('hide-shell-title'); };
  }, [label]);
  return <div ref={ref} className="page-slot">{children}</div>;
}

/* Guest pages: pressing a big picture (hero slide, room photo, card photo) lifts it up with a shadow,
   like the top menu floating over the page. It drops back when the press is released.
   It works from the picture itself, so it does not depend on the class names of each page. */
function FloatOnPress() {
  useEffect(() => {
    let lifted = null;
    let timer = null;

    const isMedia = (el) => {
      if (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'PICTURE') return true;
      const bg = getComputedStyle(el).backgroundImage;
      return Boolean(bg) && bg !== 'none' && bg.includes('url(');
    };
    // The frame that clips the picture (rounded hero or card) is what should lift, otherwise the lift is cut off.
    const frameOf = (media, body) => {
      for (let el = media; el && el !== body; el = el.parentElement) {
        const s = getComputedStyle(el);
        if (s.overflow !== 'visible' || s.overflowX !== 'visible' || s.overflowY !== 'visible') {
          const r = el.getBoundingClientRect();
          if (r.width >= 160 && r.height >= 100 && r.height <= window.innerHeight * 1.1) return el;
        }
      }
      return media;
    };
    const pick = (x, y) => {
      const body = document.querySelector('.shell-top .shell-body');
      if (!body) return null;
      // Home slideshow: find the whole hero from its buttons (.hg-cta / .hg-ghost). Walk up until the
      // wrapper that also holds the rest of the page (date bar, welcome, sections), and lift the part below it.
      const heroButton = body.querySelector('.hg-cta, .hg-ghost');
      if (heroButton) {
        let hero = null;
        for (let el = heroButton.parentElement; el && el !== body; el = el.parentElement) {
          if (el.querySelector('.gh-datebar, .gh-welcome, .gh-section, .gh-split')) break;
          hero = el;
        }
        if (hero) {
          const r = hero.getBoundingClientRect();
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && r.width >= 300 && r.height >= 200) return hero;
        }
      }
      for (const el of document.elementsFromPoint(x, y)) {
        if (!body.contains(el) || el === body || !isMedia(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 160 || r.height < 100) continue;
        return frameOf(el, body);
      }
      // Fallback: a clipped frame (hero, card) that holds a picture, even if the picture ignores the pointer.
      // Frames taller than the screen are skipped so a whole page wrapper never lifts.
      const top = document.elementFromPoint(x, y);
      for (let el = top; el && el !== body && body.contains(el); el = el.parentElement) {
        const s = getComputedStyle(el);
        const clipped = s.overflow !== 'visible' || s.overflowX !== 'visible' || s.overflowY !== 'visible';
        const r = el.getBoundingClientRect();
        if (clipped && r.width >= 200 && r.height >= 120 && r.height <= window.innerHeight * 1.1
          && el.querySelector('img, video, picture, [style*="url("]')) return el;
      }
      return null;
    };
    const drop = () => {
      if (!lifted) return;
      const el = lifted;
      lifted = null;
      el.classList.remove('float-lift');
      clearTimeout(timer);
      timer = setTimeout(() => {
        el.style.removeProperty('transition');
        if (el.dataset.floatPos) { el.style.removeProperty('position'); delete el.dataset.floatPos; }
      }, 400);
    };
    const press = (e) => {
      if (e.button > 0) return;
      // Buttons, links and fields keep their own behaviour (carousel arrows, "See rooms", and so on)
      if (e.target.closest && e.target.closest('button, a, input, select, textarea, label, [role="button"]')) return;
      drop();
      const el = pick(e.clientX, e.clientY);
      if (!el) return;
      clearTimeout(timer);
      el.style.transition = 'transform .22s ease, box-shadow .22s ease';
      // z-index only works on positioned elements; never override an element that is already positioned
      if (getComputedStyle(el).position === 'static') { el.style.position = 'relative'; el.dataset.floatPos = '1'; }
      el.classList.add('float-lift');
      lifted = el;
    };
    const noGhostDrag = (e) => {
      if (lifted && e.target.tagName === 'IMG') e.preventDefault();
    };

    // Capture phase, so a slideshow or card that stops the event cannot block the lift
    document.addEventListener('pointerdown', press, true);
    window.addEventListener('pointerup', drop, true);
    window.addEventListener('pointercancel', drop, true);
    window.addEventListener('blur', drop);
    document.addEventListener('dragstart', noGhostDrag, true);
    return () => {
      document.removeEventListener('pointerdown', press, true);
      window.removeEventListener('pointerup', drop, true);
      window.removeEventListener('pointercancel', drop, true);
      window.removeEventListener('blur', drop);
      document.removeEventListener('dragstart', noGhostDrag, true);
      clearTimeout(timer);
      drop();
    };
  }, []);
  return null;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('home');
  const [toast, setToast] = useState('');
  const [headerAction, setHeaderAction] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [related, setRelated] = useState(null);

  const notice = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); }, []);

  // Always start on the login page
  useEffect(() => { API.setToken?.(null); }, []);

  // Send bookings that were saved while offline
  useEffect(() => {
    if (!user || user.role === 'admin') return;
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

  // Device notifications for everyone who logs in: subscribe silently if already allowed,
  // otherwise ask once on the first tap (browsers only allow the prompt after a user gesture)
  useEffect(() => {
    if (!user || typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return;
    const subscribe = () => PUSH.enablePush().catch(() => {});
    if (Notification.permission === 'granted') { subscribe(); return; }
    if (Notification.permission !== 'default') return;
    const onTap = () => { subscribe(); };
    window.addEventListener('pointerdown', onTap, { once: true });
    return () => window.removeEventListener('pointerdown', onTap);
  }, [user]);

  if (!user) {
    return <Login onLogin={(u, t) => { API.setToken(t); setUser(u); setPage(u.role === 'guest' ? 'home' : 'dashboard'); }} />;
  }

  const role = MENUS[user.role] ? user.role : 'guest';
  const employee = role !== 'guest';
  const perms = employee ? user.permissions : null;

  const base = MENUS[role]
    .map(([key, label, names]) => ({ key, label, Comp: findPage(names, role) }))
    .filter((i) => i.Comp)
    .filter((i) => !perms || !GATE[i.key] || perms.includes(GATE[i.key]));
  const extras = perms
    ? EXTRA_NAV
        .filter(([key, , permission]) => perms.includes(permission) && !base.some((i) => i.key === key))
        .map(([key, label]) => ({ key, label, extra: true }))
    : [];
  const items = [...base, ...extras];
  const current = items.find((i) => i.key === page) || items[0];

  const goTo = (key) => {
    if (!items.some((i) => i.key === key)) return;
    setHeaderAction(null); setMenuOpen(false); setPage(key);
  };
  const logout = () => { API.setToken(null); setUser(null); setMenuOpen(false); setNotificationOpen(false); setRelated(null); };
  const enableBell = async () => {
    try { await PUSH.enablePush(); notice('Notifications enabled'); } catch (e) { notice(e.message); }
  };

  const Page = current?.Comp;
  const pageEl = current?.extra
    ? <FeaturePage page={current.key} user={user} goTo={goTo} />
    : Page
      ? <Page user={user} notice={notice} goTo={goTo} setHeaderAction={setHeaderAction} />
      : <p>Nothing to show.</p>;

  // Guests turn on push notifications; admin and staff open the notifications panel
  const bell = employee ? (
    <span className="notification-anchor">
      <Bell label="Notifications" expanded={notificationOpen} onClick={() => setNotificationOpen(!notificationOpen)} />
      <Notifications user={user} open={notificationOpen} onClose={() => setNotificationOpen(false)} onRecord={setRelated} goTo={goTo} />
    </span>
  ) : <Bell onClick={enableBell} />;

  const brand = (
    <div className="shell-brand"><img src="/icon.svg" alt="" width="40" height="40" /><span>Resort</span></div>
  );

  const layout = (
    <div className={role === 'guest' ? 'shell shell-top' : 'shell shell-side'}>
      {role === 'guest' ? (
        <>
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
            <div className="shell-tools">{headerAction}{bell}</div>
            {pageEl}
            <FloatOnPress />
          </div>
        </>
      ) : (
        <>
          <aside className={`side${menuOpen ? ' open' : ''}`}>
            {brand}
            <nav className="side-nav" aria-label="Main">
              {items.map((i) => (
                <button key={i.key} className={`side-link${current?.key === i.key ? ' on' : ''}`} aria-current={current?.key === i.key ? 'page' : undefined} onClick={() => goTo(i.key)}>
                  {i.label}
                </button>
              ))}
            </nav>
            <button className="side-logout side-logout-bottom" onClick={logout}>Log out</button>
          </aside>
          {menuOpen && <div className="side-scrim" onClick={() => setMenuOpen(false)} />}
          <div className="side-main">
            <header className="side-top">
              <button className="burger" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
              </button>
              <span className="who"><strong>{user.name}</strong>{user.name.toLowerCase() !== ROLE_LABEL[role].toLowerCase() && <span> · {ROLE_LABEL[role]}</span>}</span>
              <div className="side-top-actions">
                {bell}
              </div>
            </header>
            <div className="shell-body" role="main">
              <div className="shell-head">
                <h1>{current?.label}</h1>
                <div className="head-actions">{headerAction}</div>
              </div>
              <PageSlot label={current?.label}>{pageEl}</PageSlot>
            </div>
          </div>
        </>
      )}
      {related && employee && <NotificationRecord record={related} user={user} onClose={() => setRelated(null)} goTo={goTo} />}
      {toast && <div className="shell-toast" role="status">{toast}</div>}
    </div>
  );

  return employee ? (
    <AdminProvider key={user.id}>
      <EmployeeSync user={user} onUser={(u) => { setUser(u); setPage('dashboard'); }} onLogout={logout} />
      {layout}
    </AdminProvider>
  ) : layout;
}