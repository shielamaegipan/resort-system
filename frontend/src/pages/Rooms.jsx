import { useEffect, useState, useCallback } from 'react';
import { api, createBooking } from '../api.js';
import { cacheGet, cacheSet } from '../db.js';
import { resizeImage } from '../utils/resizeImage.js';
import { useConfirm } from '../components/Confirm.jsx';

const peso = (n) => '₱' + Math.round(Number(n)).toLocaleString('en-PH');
const today = () => new Date().toISOString().slice(0, 10);

export default function Rooms({ user, notice, setHeaderAction }) {
  const [rooms, setRooms] = useState([]);
  const [archived, setArchived] = useState([]);
  const [tab, setTab] = useState('active');
  const [editing, setEditing] = useState(null); // room object, {} for new
  const [booking, setBooking] = useState(null);
  const [search, setSearch] = useState({ check_in: '', check_out: '', guests: 1 });
  const [searched, setSearched] = useState(false);
  const [ask, dialog] = useConfirm();
  const isGuest = user.role === 'guest';
  const canManage = !isGuest;

  const load = useCallback(async () => {
    try {
      const r = await api('/rooms');
      setRooms(r); cacheSet('rooms', r);
      if (user.role === 'admin') setArchived(await api('/rooms/archived'));
    } catch (e) {
      if (!e.status) setRooms((await cacheGet('rooms')) || []);
      else notice(e.message);
    }
  }, [user.role, notice]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setHeaderAction(canManage ? <button className="primary" onClick={() => setEditing({})}>Add room</button> : null);
    return () => setHeaderAction(null);
  }, [canManage, setHeaderAction]);

  const doSearch = async (e) => {
    e.preventDefault();
    if (!search.check_in || !search.check_out) return notice('Choose check-in and check-out dates');
    try {
      const q = new URLSearchParams(search).toString();
      setRooms(await api('/rooms/available?' + q)); setSearched(true);
    } catch (err) { notice(err.message); }
  };
  const clearSearch = () => { setSearch({ check_in: '', check_out: '', guests: 1 }); setSearched(false); load(); };

  const remove = async (room) => {
    const ok = await ask({ title: 'Delete this room?', message: `Are you sure you want to delete ${room.name}? Only the admin can restore it afterwards.`, confirmText: 'Yes, delete', danger: true });
    if (!ok) return;
    try { await api('/rooms/' + room.id, { method: 'DELETE' }); notice('Room deleted'); load(); } catch (e) { notice(e.message); }
  };
  const restore = async (room) => {
    try { await api(`/rooms/${room.id}/restore`, { method: 'POST' }); load(); } catch (e) { notice(e.message); }
  };

  const list = tab === 'archived' ? archived : rooms;

  return (
    <>
      {user.role === 'admin' && (
        <div className="tabs">
          <button className={tab === 'active' ? 'on' : ''} onClick={() => setTab('active')}>Active</button>
          <button className={tab === 'archived' ? 'on' : ''} onClick={() => setTab('archived')}>Archived ({archived.length})</button>
        </div>
      )}
      {isGuest && (
        <form className="searchbar" onSubmit={doSearch}>
          <label>Check-in<input type="date" min={today()} value={search.check_in} onChange={(e) => setSearch({ ...search, check_in: e.target.value })} /></label>
          <label>Check-out<input type="date" min={search.check_in || today()} value={search.check_out} onChange={(e) => setSearch({ ...search, check_out: e.target.value })} /></label>
          <label>Guests<input type="number" min="1" value={search.guests} onChange={(e) => setSearch({ ...search, guests: e.target.value })} /></label>
          <button className="primary">Search rooms</button>
          {searched && <button type="button" className="ghost" onClick={clearSearch}>Show all</button>}
        </form>
      )}
      <div className="grid">
        {list.map((r) => (
          <div className="card room" key={r.id}>
            {r.image_url ? <img src={r.image_url} alt={r.name} /> : <div className="nophoto">No photo</div>}
            <div className="body">
              <div className="row"><h3>{r.name}</h3><span className="price">{peso(r.price_per_night)}<small>/night</small></span></div>
              <p className="rtype">{r.type}{r.status === 'maintenance' && <b className="pill warn">Maintenance</b>}</p>
              <p className="muted rcap">Up to {r.capacity} {Number(r.capacity) === 1 ? 'guest' : 'guests'}</p>
              <RoomDesc text={r.description} />
              <div className="actions">
                {tab === 'archived' ? <button onClick={() => restore(r)}>Restore</button> : canManage ? (
                  <>
                    <button onClick={() => setEditing(r)}>Edit</button>
                    <button className="danger" onClick={() => remove(r)}>Delete</button>
                  </>
                ) : r.status === 'available' && (
                  <button className="primary" onClick={() => setBooking(r)}>Book now</button>
                )}
              </div>
            </div>
          </div>
        ))}
        {!list.length && <p className="muted">{searched ? 'No rooms are free for those dates.' : 'No rooms yet.'}</p>}
      </div>
      {editing && <RoomForm room={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} notice={notice} />}
      {booking && <BookForm room={booking} user={user} dates={search} onClose={() => setBooking(null)} notice={notice} />}
      {dialog}
    </>
  );
}

// Long descriptions are cut short; the "…" is a button that shows the full text
function RoomDesc({ text = '' }) {
  const [open, setOpen] = useState(false);
  const LIMIT = 85;
  if (text.length <= LIMIT) return <p className="rdesc">{text}</p>;
  return (
    <p className="rdesc">
      {open ? text : text.slice(0, LIMIT).trimEnd()}
      {open ? (
        <button type="button" className="dots less" onClick={() => setOpen(false)}> Show less</button>
      ) : (
        <button type="button" className="dots" title="Show full description" aria-label="Show full description" onClick={() => setOpen(true)}>…</button>
      )}
    </p>
  );
}

function RoomForm({ room, onClose, onSaved, notice }) {
  const [f, setF] = useState({ name: room.name || '', type: room.type || 'Standard', capacity: room.capacity || 2, price_per_night: room.price_per_night != null ? Math.round(room.price_per_night) : '', description: room.description || '', status: room.status || 'available' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const saved = room.id ? await api('/rooms/' + room.id, { method: 'PUT', body: f }) : await api('/rooms', { method: 'POST', body: f });
      if (file) await api(`/rooms/${saved.id}/image`, { method: 'POST', body: { image: await resizeImage(file) } });
      notice('Room saved'); onSaved();
    } catch (err) { notice(err.message); setBusy(false); }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2>{room.id ? 'Edit room' : 'Add room'}</h2>
        <label>Name<input value={f.name} onChange={set('name')} required /></label>
        <div className="two">
          <label>Type<input value={f.type} onChange={set('type')} /></label>
          <label>Capacity<input type="number" min="1" value={f.capacity} onChange={set('capacity')} /></label>
        </div>
        <div className="two">
          <label>Price per night<input type="number" min="0" step="1" value={f.price_per_night} onChange={set('price_per_night')} required /></label>
          <label>Status<select value={f.status} onChange={set('status')}><option value="available">Available</option><option value="maintenance">Maintenance</option></select></label>
        </div>
        <label>Description<textarea rows="3" value={f.description} onChange={set('description')} /></label>
        <label>Picture<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
        <div className="actions end"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>Save</button></div>
      </form>
    </div>
  );
}

function BookForm({ room, user, dates, onClose, notice }) {
  const [f, setF] = useState({ guest_name: user.name, guest_contact: '', guests: dates.guests || 1, check_in: dates.check_in, check_out: dates.check_out });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const nights = f.check_in && f.check_out ? Math.round((new Date(f.check_out) - new Date(f.check_in)) / 86400000) : 0;

  const submit = async (e) => {
    e.preventDefault();
    if (nights <= 0) return notice('Check-out must be after check-in');
    setBusy(true);
    try {
      const r = await createBooking({ ...f, room_id: room.id });
      notice(r.queued ? 'You are offline. Booking saved and will sync when you are back online.' : 'Booking sent. Please wait for the staff to confirm.');
      onClose();
    } catch (err) { notice(err.message); setBusy(false); }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Book {room.name}</h2>
        <label>Guest name<input value={f.guest_name} onChange={set('guest_name')} required /></label>
        <label>Contact number<input value={f.guest_contact} onChange={set('guest_contact')} /></label>
        <div className="two">
          <label>Check-in<input type="date" min={today()} value={f.check_in} onChange={set('check_in')} required /></label>
          <label>Check-out<input type="date" min={f.check_in || today()} value={f.check_out} onChange={set('check_out')} required /></label>
        </div>
        <label>Guests (max {room.capacity})<input type="number" min="1" max={room.capacity} value={f.guests} onChange={set('guests')} /></label>
        {nights > 0 && <p className="total">{nights} night(s) · Total {peso(nights * room.price_per_night)}</p>}
        <div className="actions end"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>Confirm booking</button></div>
      </form>
    </div>
  );
}
