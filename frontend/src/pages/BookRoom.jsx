import { useEffect, useRef, useState } from 'react';
import { api, createBooking } from '../api.js';
import { cacheGet, cacheSet } from '../db.js';
import { peso } from './Bookings.jsx';
import './staff.css';
import './guest.css';

const today = () => new Date().toLocaleDateString('en-CA');
const nightsOf = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
// Same rule as the server: a stay may start on the day another one ends
const overlaps = (ranges, a, b) => !!a && !!b && ranges.some((x) => a < x.check_out && b > x.check_in);
const BLOCKED = ['maintenance', 'out_of_service'];

export default function BookRoom({ user, notice, goTo }) {
  const [f, setF] = useState({ check_in: today(), check_out: '', guests: 1 });
  const [rooms, setRooms] = useState(null);
  const [booked, setBooked] = useState({});
  const [offline, setOffline] = useState(false);
  const [sel, setSel] = useState(null);
  const [name, setName] = useState(user.name);
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);
  const nights = f.check_out ? nightsOf(f.check_in, f.check_out) : 0;
  const validDates = nights > 0;

  useEffect(() => {
    let alive = true;
    (async () => {
      let list;
      try {
        list = await api('/rooms');
        cacheSet('rooms', list);
      } catch (err) {
        if (err.status) { notice(err.message); list = []; }
        else { list = (await cacheGet('rooms')) || []; if (alive) setOffline(true); }
      }
      if (!alive) return;
      setRooms(list);
      // Load the booked dates of every room (dates only, no guest details)
      const entries = await Promise.all(list.map(async (r) => {
        try { return [r.id, await api(`/rooms/${r.id}/booked-dates`)]; } catch { return [r.id, []]; }
      }));
      if (alive) setBooked(Object.fromEntries(entries));
    })();
    return () => { alive = false; };
  }, [notice]);

  const choose = (r) => {
    setSel(r);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  const ranges = sel ? booked[sel.id] || [] : [];
  const clash = sel && validDates && overlaps(ranges, f.check_in, f.check_out);
  const tooMany = sel && Number(f.guests) > sel.capacity;

  const submit = async (e) => {
    e.preventDefault();
    if (!validDates) return notice('Check-out must be after check-in');
    if (clash) return notice('Those dates are already booked. Please choose other dates.');
    if (tooMany) return notice(`This room fits up to ${sel.capacity} guests`);
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
        <div className="formrow">
          <label>Check-in<input type="date" required min={today()} value={f.check_in} onChange={(e) => setF({ ...f, check_in: e.target.value })} /></label>
          <label>Check-out<input type="date" required min={f.check_in} value={f.check_out} onChange={(e) => setF({ ...f, check_out: e.target.value })} /></label>
          <label>Guests<input type="number" min="1" style={{ width: 80 }} value={f.guests} onChange={(e) => setF({ ...f, guests: e.target.value })} /></label>
        </div>
        <p className="muted">Pick your dates to see which rooms are free. You can still book a room that has other bookings, as long as your dates do not overlap.</p>
      </div>

      {offline && <p className="banner">You are offline. These rooms are from your last visit and the booked dates may be out of date.</p>}
      {rooms && (
        <>
          <p className="muted">{rooms.length} room(s){validDates ? ` · ${nights} night(s)` : ''}</p>
          <div className="rooms-grid">
            {rooms.map((r) => {
              const rr = booked[r.id] || [];
              const blocked = BLOCKED.includes(r.status);
              const taken = validDates && overlaps(rr, f.check_in, f.check_out);
              return (
                <div key={r.id} className={`card room-card ${sel?.id === r.id ? 'sel' : ''}`}>
                  {r.image_url ? <img src={r.image_url} alt={r.name} /> : <div className="noimg" />}
                  <div className="body">
                    <strong>{r.name}</strong>
                    <span className="muted">{r.type} · up to {r.capacity} guests</span>
                    <span>{r.description}</span>
                    <span><strong>{peso(r.price_per_night)}</strong> / night{validDates ? ` · ${peso(r.price_per_night * nights)} total` : ''}</span>
                    {validDates && !blocked && <span className={taken ? 'error' : 'muted'}>{taken ? 'Booked on your dates' : 'Free on your dates'}</span>}
                    {rr.length > 0 && (
                      <div className="muted">
                        <div>Already booked:</div>
                        {rr.map((x, i) => <div key={i}>{x.check_in} → {x.check_out}</div>)}
                      </div>
                    )}
                    {blocked
                      ? <span className="muted">Not available right now</span>
                      : <button className="primary" onClick={() => choose(r)}>{sel?.id === r.id ? 'Selected' : 'Book'}</button>}
                  </div>
                </div>
              );
            })}
          </div>
          {!rooms.length && <p className="muted">No rooms found.</p>}
        </>
      )}

      {sel && (
        <div className="card pad" ref={formRef} style={{ marginTop: 16 }}>
          <h3>Book {sel.name}</h3>
          {ranges.length > 0 && (
            <p className="muted">Already booked: {ranges.map((x) => `${x.check_in} → ${x.check_out}`).join(' · ')}</p>
          )}
          <form className="formrow" onSubmit={submit}>
            <label>Check-in<input type="date" required min={today()} value={f.check_in} onChange={(e) => setF({ ...f, check_in: e.target.value })} /></label>
            <label>Check-out<input type="date" required min={f.check_in} value={f.check_out} onChange={(e) => setF({ ...f, check_out: e.target.value })} /></label>
            <label>Guests<input type="number" min="1" max={sel.capacity} style={{ width: 80 }} value={f.guests} onChange={(e) => setF({ ...f, guests: e.target.value })} /></label>
            <label>Guest name<input required value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>Contact (phone/email)<input required value={contact} onChange={(e) => setContact(e.target.value)} /></label>
            <button className="primary" disabled={busy || !validDates || clash || tooMany}>
              {busy ? 'Sending…' : validDates ? `Book · ${peso(sel.price_per_night * nights)}` : 'Choose dates'}
            </button>
          </form>
          {clash && <p className="error" role="alert">Those dates overlap an existing booking. Please choose other dates.</p>}
          {tooMany && <p className="error" role="alert">This room fits up to {sel.capacity} guests.</p>}
        </div>
      )}
    </>
  );
}