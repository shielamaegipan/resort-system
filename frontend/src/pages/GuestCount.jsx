import { useEffect, useState } from 'react';
import { api } from '../api.js';
import './staff.css';

const today = () => new Date().toLocaleDateString('en-CA');

export default function GuestCount({ notice }) {
  const [date, setDate] = useState(today());
  const [d, setD] = useState(null);
  useEffect(() => { api('/guests/count?date=' + date).then(setD).catch((e) => notice(e.message)); }, [date, notice]);

  return (
    <>
      <div className="toolbar"><label>Date <input type="date" value={date} onChange={(e) => setDate(e.target.value || today())} /></label></div>
      {d && (
        <>
          <div className="stats">
            {[['In house', d.in_house], ['Arriving', d.arriving], ['Departing', d.departing]].map(([l, x]) => (
              <div key={l} className="card stat"><div className="n">{x.guests} guests</div><div className="l">{l} · {x.bookings} booking(s)</div></div>
            ))}
          </div>
          <div className="card table-wrap">
            <table>
              <thead><tr><th>Room</th><th>Guest</th><th>Guests</th><th>Stay</th></tr></thead>
              <tbody>
                {d.in_house_list.map((b) => <tr key={b.id}><td>{b.room_name}</td><td><strong>{b.guest_name}</strong></td><td>{b.guests}</td><td>{b.check_in} → {b.check_out}</td></tr>)}
                {!d.in_house_list.length && <tr><td colSpan="4" className="muted">No guests in house on this date.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
