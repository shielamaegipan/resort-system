import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { peso, LABEL } from './Bookings.jsx';
import './staff.css';

export default function StaffDashboard({ notice }) {
  const [d, setD] = useState(null);
  useEffect(() => { api('/staff/dashboard').then(setD).catch((e) => notice(e.message)); }, [notice]);
  if (!d) return <p className="muted">Loading…</p>;
  const cards = [
    ['Rooms', d.rooms.total], ['Occupied today', d.occupied_today], ['Free today', d.free_today],
    ['Maintenance', Number(d.rooms.maintenance)], ['Arrivals today', `${d.arrivals_today} (${d.arriving_guests} guests)`],
    ['Departures today', `${d.departures_today} (${d.departing_guests} guests)`], ['Guests in house', d.in_house_guests],
    ['Pending bookings', d.pending_bookings], ['Cash today', peso(d.cash_today)], ['Services today', d.services_today],
  ];
  return (
    <>
      <div className="stats">
        {cards.map(([l, n]) => <div key={l} className="card stat"><div className="n">{n}</div><div className="l">{l}</div></div>)}
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Pending booking</th><th>Room</th><th>Dates</th><th>Guests</th><th>Status</th></tr></thead>
          <tbody>
            {d.pending_list.map((b) => (
              <tr key={b.id}><td><strong>{b.guest_name}</strong></td><td>{b.room_name}</td><td>{b.check_in} → {b.check_out}</td><td>{b.guests}</td><td><span className={`pill s-${b.status}`}>{LABEL[b.status]}</span></td></tr>
            ))}
            {!d.pending_list.length && <tr><td colSpan="5" className="muted">No pending bookings.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
