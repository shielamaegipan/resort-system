import { useState } from 'react';
import { api, createBooking } from '../api.js';
import { cacheGet } from '../db.js';
import { peso } from './Bookings.jsx';
import './staff.css';
import './guest.css';

const today = () => new Date().toLocaleDateString('en-CA');
const nightsOf = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

export default function BookRoom({ user, notice, goTo }) {
  const [f, setF] = useState({ check_in: today(), check_out: '', guests: 1 });
  const [rooms, setRooms] = useState(null);
  const [offline, setOffline] = useState(false);
  const [sel, setSel] = useState(null);
  const [name, setName] = useState(user.name);
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const nights = f.check_out ? nightsOf(f.check_in, f.check_out) : 0;

  const search = async (e) => {
    e.preventDefault();
    if (!(nights > 0)) return notice('Check-out must be after check-in');
    setSel(null); setOffline(false);
    try {
      setRooms(await api(`/rooms/available?check_in=${f.check_in}&check_out=${f.check_out}&guests=${f.guests}`));
    } catch (err) {
      if (err.status) return notice(err.message);
      // offline: use the rooms saved earlier; the server checks the dates when it syncs
      const cached = (await cacheGet('rooms')) || [];
      setRooms(cached.filter((r) => r.status === 'available' && r.capacity >= Number(f.guests)));
      setOffline(true);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await createBooking({ room_id: sel.id, guest_name: name, guest_contact: contact, guests: Number(f.guests), check_in: f.check_in, check_out: f.check_out });
      notice(r.queued ? 'Saved offline. It will be sent when you are back online.' : 'Booking sent! Please wait for the front desk to confirm.');
      goTo('mybookings');
    } catch (err) { notice(err.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="card pad">
        <h3>Choose your dates</h3>
        <form className="formrow" onSubmit={search}>
          <label>Check-in<input type="date" required min={today()} value={f.check_in} onChange={(e) => setF({ ...f, check_in: e.target.value })} /></label>
          <label>Check-out<input type="date" required min={f.check_in} value={f.check_out} onChange={(e) => setF({ ...f, check_out: e.target.value })} /></label>
          <label>Guests<input type="number" min="1" style={{ width: 80 }} value={f.guests} onChange={(e) => setF({ ...f, guests: e.target.value })} /></label>
          <button className="primary">Search rooms</button>
        </form>
      </div>

      {offline && <p className="banner">You are offline. These rooms are from your last visit and the dates are not checked yet.</p>}
      {rooms && (
        <>
          <p className="muted">{rooms.length} room(s) available · {nights} night(s)</p>
          <div className="rooms-grid">
            {rooms.map((r) => (
              <div key={r.id} className={`card room-card ${sel?.id === r.id ? 'sel' : ''}`}>
                {r.image_url ? <img src={r.image_url} alt={r.name} /> : <div className="noimg" />}
                <div className="body">
                  <strong>{r.name}</strong>
                  <span className="muted">{r.type} · up to {r.capacity} guests</span>
                  <span>{r.description}</span>
                  <span><strong>{peso(r.price_per_night)}</strong> / night · {peso(r.price_per_night * nights)} total</span>
                  <button className="primary" onClick={() => setSel(r)}>{sel?.id === r.id ? 'Selected' : 'Select'}</button>
                </div>
              </div>
            ))}
          </div>
          {!rooms.length && <p className="muted">No room is free for those dates. Try other dates.</p>}
        </>
      )}

      {sel && (
        <div className="card pad" style={{ marginTop: 16 }}>
          <h3>Book {sel.name}</h3>
          <form className="formrow" onSubmit={submit}>
            <label>Guest name<input required value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>Contact (phone/email)<input required value={contact} onChange={(e) => setContact(e.target.value)} /></label>
            <button className="primary" disabled={busy}>{busy ? 'Sending…' : `Book · ${peso(sel.price_per_night * nights)}`}</button>
          </form>
        </div>
      )}
    </>
  );
}
