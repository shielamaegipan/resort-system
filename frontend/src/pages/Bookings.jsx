import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { cacheGet, cacheSet, pendingBookings } from '../db.js';
import { useConfirm } from '../components/Confirm.jsx';

export const peso = (n) => '₱' + Math.round(Number(n)).toLocaleString('en-PH');
export const LABEL = { pending: 'Pending', confirmed: 'Confirmed', checked_in: 'Checked in', checked_out: 'Checked out', cancelled: 'Cancelled' };

// Buttons shown for a booking, depending on who is looking and its status
export function actionsFor(role, status) {
  if (role === 'guest') return status === 'pending' ? [['cancelled', 'Cancel']] : []; // no cancel once confirmed
  if (status === 'pending') return [['confirmed', 'Confirm'], ['cancelled', 'Decline']];
  if (status === 'confirmed') return [['checked_in', 'Check in'], ['cancelled', 'Cancel']];
  if (status === 'checked_in') return [['checked_out', 'Check out']];
  return [];
}

export default function Bookings({ user, notice }) {
  const [rows, setRows] = useState([]);
  const [archived, setArchived] = useState([]);
  const [queued, setQueued] = useState([]);
  const [tab, setTab] = useState('active');
  const [ask, dialog] = useConfirm();
  const isGuest = user.role === 'guest';

  const load = useCallback(async () => {
    try {
      const r = await api('/bookings');
      setRows(r); cacheSet('bookings', r);
      if (user.role === 'admin') setArchived(await api('/bookings/archived'));
    } catch (e) {
      if (!e.status) setRows((await cacheGet('bookings')) || []);
      else notice(e.message);
    }
    if (isGuest) setQueued(await pendingBookings());
  }, [user.role, isGuest, notice]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (b, status) => {
    if (status === 'cancelled') {
      const ok = await ask({ title: 'Cancel this booking?', message: `Are you sure you want to cancel the booking of ${b.guest_name} for ${b.room_name}?`, confirmText: 'Yes, cancel booking', cancelText: 'No, go back', danger: true });
      if (!ok) return;
    }
    try { await api(`/bookings/${b.id}/status`, { method: 'PATCH', body: { status } }); load(); } catch (e) { notice(e.message); load(); }
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
      {user.role === 'admin' && (
        <div className="tabs">
          <button className={tab === 'active' ? 'on' : ''} onClick={() => setTab('active')}>Active</button>
          <button className={tab === 'archived' ? 'on' : ''} onClick={() => setTab('archived')}>Archived ({archived.length})</button>
        </div>
      )}
      {queued.length > 0 && <p className="banner">{queued.length} booking(s) saved offline. They will be sent when you are back online.</p>}
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
                      {actionsFor(user.role, b.status).map(([s, label]) => (
                        <button key={s} className={s === 'cancelled' ? '' : 'primary'} onClick={() => setStatus(b, s)}>{label}</button>
                      ))}
                      {!isGuest && <button className="danger" onClick={() => remove(b)}>Delete</button>}
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="7" className="muted">No bookings yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {dialog}
    </>
  );
}
