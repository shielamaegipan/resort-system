import { useEffect, useState } from 'react';
import { api, peso } from '../api';
import { queueBooking, getQueue } from '../offline';

const STATUSES = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'];
const label = (s) => s.replace('_', ' ');

export default function Bookings({ user, online, tick }) {
  const staff = user.role === 'admin' || user.role === 'staff';
  const blank = { room_id: '', guest_name: user.name, guest_contact: '', guests: 1, check_in: '', check_out: '' };
  const [rooms, setRooms] = useState([]);
  const [rows, setRows] = useState([]);
  const [archived, setArchived] = useState([]);
  const [queue, setQueue] = useState([]);
  const [tab, setTab] = useState('active');
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');

  const load = async () => {
    setQueue(await getQueue());
    try {
      setRooms((await api('/rooms')).filter((r) => r.status === 'available'));
      setRows(await api('/bookings'));
      if (staff) setArchived(await api('/bookings/archived'));
    } catch (e) { setMsg(e.message); }
  };
  useEffect(() => { load(); }, [tick]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setMsg(''); setOk('');
    const body = { ...f, room_id: Number(f.room_id), guests: Number(f.guests) };
    const saveOffline = async () => {
      await queueBooking(body);
      setOk('You are offline. Your booking was saved and will be sent automatically when you are back online.');
      setF(blank); setQueue(await getQueue());
    };
    if (!navigator.onLine) return saveOffline();
    try {
      await api('/bookings', { method: 'POST', body });
      setOk('Booking saved!'); setF(blank); load();
    } catch (e2) {
      if (!e2.status) return saveOffline(); // network error
      setMsg(e2.message);
    }
  };

  const act = async (fn) => { try { await fn(); load(); } catch (e) { setMsg(e.message); } };
  const setStatus = (id, status) => act(() => api(`/bookings/${id}/status`, { method: 'PATCH', body: { status } }));
  const archive = (id) => act(() => api('/bookings/' + id, { method: 'DELETE' }));
  const roomName = (id) => rooms.find((r) => r.id === id)?.name || `Room #${id}`;

  const list = tab === 'active' ? rows : archived;

  return (
    <>
      <h2 className="title">Bookings</h2>

      <form className="card grid" onSubmit={submit}>
        <select value={f.room_id} onChange={set('room_id')} required>
          <option value="">Select a room</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} · {peso(r.price_per_night)} · max {r.capacity}</option>)}
        </select>
        <input placeholder="Guest name" value={f.guest_name} onChange={set('guest_name')} required />
        <input required type="tel" inputMode="numeric" pattern="[0-9]{11}" maxLength={11} placeholder="Contact number (11 digits)" value={f.guest_contact} onChange={(e) => setF({ ...f, guest_contact: e.target.value.replace(/\D/g, '').slice(0, 11) })} />
        <input type="number" min="1" placeholder="Number of guests" value={f.guests} onChange={set('guests')} required />
        <label>Check-in<input type="date" value={f.check_in} onChange={set('check_in')} required /></label>
        <label>Check-out<input type="date" value={f.check_out} onChange={set('check_out')} required /></label>
        <div className="span row">
          <button className="primary">Book now</button>
          {!online && <span className="muted">Offline mode: saved on this device</span>}
        </div>
        {msg && <p className="err span">{msg}</p>}
        {ok && <p className="good span">{ok}</p>}
      </form>

      {queue.length > 0 && (
        <div className="card queue">
          <strong>Queued (not sent yet): {queue.length}</strong>
          {queue.map((q) => (
            <div key={q.localId} className="muted">{q.guest_name} · {roomName(q.room_id)} · {q.check_in} → {q.check_out}</div>
          ))}
        </div>
      )}

      {staff && (
        <div className="tabs">
          <button className={tab === 'active' ? 'primary' : 'ghost'} onClick={() => setTab('active')}>Active ({rows.length})</button>
          <button className={tab === 'archived' ? 'primary' : 'ghost'} onClick={() => setTab('archived')}>Archived ({archived.length})</button>
        </div>
      )}

      <div className="cards">
        {list.map((b) => (
          <div className="card" key={b.id}>
            <div className="row between">
              <h3>{b.room_name}</h3>
              <span className={'pill ' + b.status}>{label(b.status)}</span>
            </div>
            <p>{b.guest_name}{b.guest_contact ? ` · ${b.guest_contact}` : ''}</p>
            <p className="muted">{b.check_in} → {b.check_out} · {b.guests} guest(s)</p>
            <p className="price">{peso(b.total_price)}</p>
            {tab === 'active' && (
              <div className="row">
                {staff ? (
                  <>
                    <select value={b.status} onChange={(e) => setStatus(b.id, e.target.value)}>
                      {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                    </select>
                    <button className="ghost danger" onClick={() => archive(b.id)}>Archive</button>
                  </>
                ) : (
                  b.status !== 'cancelled' && b.status !== 'checked_out' && (
                    <button className="ghost danger" onClick={() => setStatus(b.id, 'cancelled')}>Cancel booking</button>
                  )
                )}
              </div>
            )}
          </div>
        ))}
        {!list.length && <p className="muted">No bookings yet.</p>}
      </div>
    </>
  );
}
