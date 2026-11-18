import { useEffect, useState } from 'react';
import { api } from '../api.js';
import './staff.css';

const today = () => new Date().toLocaleDateString('en-CA');
const STATE = { available: 'Available', reserved: 'Reserved', occupied: 'Occupied', maintenance: 'Maintenance' };

export default function RoomAvailability({ notice }) {
  const [date, setDate] = useState(today());
  const [data, setData] = useState(null);
  useEffect(() => { api('/rooms/availability?date=' + date).then(setData).catch((e) => notice(e.message)); }, [date, notice]);

  return (
    <>
      <div className="toolbar">
        <label>Date <input type="date" value={date} onChange={(e) => setDate(e.target.value || today())} /></label>
        {data && Object.entries(data.summary).map(([k, v]) => <span key={k} className={`pill st-${k}`}>{STATE[k]}: {v}</span>)}
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Room</th><th>Type</th><th>Capacity</th><th>State</th><th>Guest</th><th>Stay</th></tr></thead>
          <tbody>
            {data?.rooms.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.name}</strong></td><td>{r.type}</td><td>{r.capacity}</td>
                <td><span className={`pill st-${r.state}`}>{STATE[r.state]}</span></td>
                <td>{r.booking ? `${r.booking.guest_name} · ${r.booking.guests} ${Number(r.booking.guests) === 1 ? 'guest' : 'guests'}` : '—'}</td>
                <td>{r.booking ? `${r.booking.check_in} → ${r.booking.check_out}` : '—'}</td>
              </tr>
            ))}
            {data && !data.rooms.length && <tr><td colSpan="6" className="muted">No rooms.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
