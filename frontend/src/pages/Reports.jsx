import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { peso, LABEL } from './Bookings.jsx';

export default function Reports({ notice }) {
  const [d, setD] = useState(null);
  useEffect(() => { api('/reports/summary').then(setD).catch((e) => notice(e.message)); }, [notice]);
  if (!d) return <p className="muted">Loading…</p>;

  const total = Number(d.rooms.total) || 0;
  const rate = total ? Math.round((d.occupied_today / total) * 100) : 0;
  const stat = (label, value) => <div className="card stat"><span className="muted">{label}</span><strong>{value}</strong></div>;

  return (
    <div className="stack">
      <div className="stats">
        {stat('Revenue (confirmed and up)', peso(d.revenue))}
        {stat('Bookings', d.bookings)}
        {stat('Occupied today', `${d.occupied_today} / ${total} (${rate}%)`)}
        {stat('Rooms available', d.rooms.available ?? 0)}
        {stat('Staff accounts', d.users.staff ?? 0)}
        {stat('Guest accounts', d.users.guests ?? 0)}
      </div>
      <div className="two-col">
        <div className="card pad">
          <h3>Bookings by status</h3>
          {d.byStatus.map((s) => <div className="line" key={s.status}><span className={`pill s-${s.status}`}>{LABEL[s.status]}</span><strong>{s.n}</strong></div>)}
        </div>
        <div className="card pad">
          <h3>Monthly</h3>
          {d.monthly.map((m) => <div className="line" key={m.month}><span>{m.month}</span><span>{m.bookings} bookings · <strong>{peso(m.revenue)}</strong></span></div>)}
          {!d.monthly.length && <p className="muted">No data yet.</p>}
        </div>
      </div>
    </div>
  );
}
