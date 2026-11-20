import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { cacheGet, cacheSet, pendingBookings } from '../db.js';
import { useLiveRefresh } from '../features/live.js';
import { useDebounced } from '../admin/data.jsx';
import { BookingDetail } from '../admin/Calendar.jsx';
import NewBooking from '../admin/NewBooking.jsx';
import { useConfirm } from '../components/Confirm.jsx';

export const peso = (n) => '₱' + Math.round(Number(n)).toLocaleString('en-PH');
export const LABEL = { pending: 'Pending', confirmed: 'Confirmed', checked_in: 'Checked in', checked_out: 'Checked out', cancelled: 'Cancelled', no_show: 'No Show' };

// Buttons shown for a booking, depending on who is looking and its status
export function actionsFor(role, status) {
  if (role === 'guest') return status === 'pending' ? [['cancelled', 'Cancel']] : []; // no cancel once confirmed
  if (status === 'pending') return [['confirmed', 'Confirm'], ['cancelled', 'Decline']];
  if (status === 'confirmed') return [['checked_in', 'Check in'], ['cancelled', 'Cancel'], ['no_show', 'No Show']];
  if (status === 'checked_in') return [['checked_out', 'Check out']];
  return [];
}

export default function Bookings({ user, notice, initialFilters }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [archived, setArchived] = useState([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [queued, setQueued] = useState([]);
  const [tab, setTab] = useState('active');
  const [ask, dialog] = useConfirm();
  const isGuest = user.role === 'guest';
  const [detail, setDetail] = useState(null), [creating, setCreating] = useState(false), [rooms, setRooms] = useState([]), [page, setPage] = useState(1), [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState({ search: '', status: '', start: '', end: '', room_id: '', user_id: '' });
  useEffect(() => { if (user.role === 'admin') { setFilters({ search: '', status: '', start: '', end: '', room_id: '', user_id: '', ...initialFilters }); setPage(1); setTab('active'); } }, [initialFilters, user.role]);
  const applied = useDebounced(filters);
  useEffect(() => { if (!isGuest) api('/rooms').then(setRooms).catch((e) => notice(e.message)); }, [isGuest, notice]);

  const load = useCallback(async () => {
    try {
      const r = await api(isGuest ? '/bookings' : '/advanced/bookings?' + new URLSearchParams({ ...applied, page }));
      setError(''); setRows(isGuest ? r : r.items); setMeta(isGuest ? null : r); cacheSet('bookings', isGuest ? r : r.items);
      if (user.role === 'admin') {
        const arch = await api('/advanced/bookings?' + new URLSearchParams({ ...applied, page, archived: 1 }));
        setArchived(arch.items); setArchivedCount(arch.total);
        if (tab === 'archived') setMeta(arch);
      }
    } catch (e) {
      setError(e.message);
      if (!e.status) setRows((await cacheGet('bookings')) || []);
      else notice(e.message);
    } finally { setLoading(false); }
    if (isGuest) setQueued(await pendingBookings());
  }, [user.role, isGuest, notice, applied, page, tab]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  const setStatus = async (b, status) => {
    if (status === 'cancelled') {
      const ok = await ask({ title: 'Cancel this booking?', message: `Are you sure you want to cancel the booking of ${b.guest_name} for ${b.room_name}?`, confirmText: 'Yes, cancel booking', cancelText: 'No, go back', danger: true });
      if (!ok) return;
    }
    try {
      if (status === 'checked_in') {
        await api(`/bookings/${b.id}/check-in`, { method: 'POST' });
      } else if (status === 'checked_out') {
        try {
          await api(`/bookings/${b.id}/check-out`, { method: 'POST', body: {} });
        } catch (e) {
          if (e.status !== 409) throw e;
          // Unpaid balance: let the staff decide
          const ok = await ask({ title: 'Unpaid balance', message: `${e.message} Check out anyway?`, confirmText: 'Check out anyway', cancelText: 'Collect payment first', danger: true });
          if (!ok) { notice('Open Cash Payments to collect the balance.'); return; }
          await api(`/bookings/${b.id}/check-out`, { method: 'POST', body: { allow_unpaid: true } });
        }
      } else {
        await api(`/bookings/${b.id}/status`, { method: 'PATCH', body: { status } });
      }
      load();
    } catch (e) { notice(e.message); load(); }
  };
  const remove = async (b) => {
    const ok = await ask({ title: 'Delete this booking?', message: `Are you sure you want to delete the booking of ${b.guest_name} (${b.room_name})? Only the admin can restore it afterwards.`, confirmText: 'Yes, delete', danger: true });
    if (!ok) return;
    try { await api('/bookings/' + b.id, { method: 'DELETE' }); notice('Booking deleted'); load(); } catch (e) { notice(e.message); }
  };
  const restore = async (b) => {
    try { await api(`/bookings/${b.id}/restore`, { method: 'POST' }); load(); } catch (e) { notice(e.message); }
  };

  const list = tab === 'archived' ? archived : rows;

  return (
    <>
      {!isGuest && <div className="actions" style={{ marginBottom: 12 }}><button className="primary" onClick={() => setCreating(true)}>New booking</button></div>}
      {user.role === 'admin' && (
        <div className="tabs">
          <button className={tab === 'active' ? 'on' : ''} onClick={() => { setTab('active'); setPage(1); }}>Active</button>
          <button className={tab === 'archived' ? 'on' : ''} onClick={() => { setTab('archived'); setPage(1); }}>Archived ({archivedCount})</button>
        </div>
      )}
      {queued.length > 0 && <p className="banner">{queued.length} booking(s) saved offline. They will be sent when you are back online.</p>}
      {error && <p className="error" role="alert">{error} <button onClick={load}>Retry</button></p>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Guest</th><th>Room</th><th>Dates</th><th>Guests</th><th>Total</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id}>
                <td><strong>{b.guest_name}</strong><div className="muted">{b.guest_contact}</div></td>
                <td>{b.room_name}</td>
                <td>{b.check_in} → {b.check_out}</td>
                <td>{b.guests}</td>
                <td>{peso(b.total_price)}</td>
                <td><span className={`pill s-${b.status}`}>{LABEL[b.status]}</span></td>
                <td className="actions">
                  {tab === 'archived' ? <button onClick={() => restore(b)}>Restore</button> : (
                    <>
                      {actionsFor(user.role, b.status).filter(([s]) => s !== 'no_show' || b.check_in <= new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())).map(([s, label]) => (
                        <button key={s} className={s === 'cancelled' ? '' : 'primary'} onClick={() => setStatus(b, s)}>{label}</button>
                      ))}
                      {!isGuest && <button onClick={() => setDetail(b.id)}>Details</button>}
                      {!isGuest && <button className="danger" onClick={() => remove(b)}>Delete</button>}
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="7" className="muted">{loading ? 'Loading bookings...' : 'No bookings yet.'}</td></tr>}
          </tbody>
        </table>
      </div>
    
      {!isGuest && meta && <div className="feature-pagination"><span>{meta.total} records · Page {meta.page} of {meta.pages}</span><div className="actions"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button disabled={page >= meta.pages} onClick={() => setPage(page + 1)}>Next</button></div></div>}
      {!isGuest && <details className="feature-options"><summary>Booking search and actions</summary><div className="actions"><button className="primary" onClick={() => setCreating(true)}>New booking</button></div><form className="card pad searchbar" onSubmit={(e) => e.preventDefault()}><label>Guest, contact or reference<input type="search" value={filters.search} onChange={(e) => { setFilters({ ...filters, search: e.target.value }); setPage(1); }} /></label><label>Status<select value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}><option value="">All</option>{Object.entries(LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>From<input type="date" value={filters.start} onChange={(e) => { setFilters({ ...filters, start: e.target.value }); setPage(1); }} /></label><label>Through<input type="date" min={filters.start} value={filters.end} onChange={(e) => { setFilters({ ...filters, end: e.target.value }); setPage(1); }} /></label><label>Room<select value={filters.room_id} onChange={(e) => { setFilters({ ...filters, room_id: e.target.value }); setPage(1); }}><option value="">All rooms</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>Guest account ID<input type="number" min="1" value={filters.user_id} onChange={(e) => { setFilters({ ...filters, user_id: e.target.value }); setPage(1); }} /></label></form></details>}
      {detail && <section className="feature-panel"><BookingDetail id={detail} user={user} onClose={() => setDetail(null)} /></section>}
      {creating && <section className="feature-panel"><NewBooking onClose={() => setCreating(false)} /></section>}
      {dialog}
    </>
  );
}