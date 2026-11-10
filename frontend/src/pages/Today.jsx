import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { LABEL } from './Bookings.jsx';

export default function Today({ notice }) {
  const [data, setData] = useState({ arrivals: [], departures: [] });

  const load = useCallback(() => api('/bookings/today').then(setData).catch((e) => notice(e.message)), [notice]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (b, status) => {
    try { await api(`/bookings/${b.id}/status`, { method: 'PATCH', body: { status } }); load(); } catch (e) { notice(e.message); }
  };

  const Section = ({ title, rows, render }) => (
    <div className="card pad">
      <h3>{title} <span className="muted">({rows.length})</span></h3>
      {rows.map((b) => (
        <div className="line" key={b.id}>
          <div><strong>{b.guest_name}</strong> · {b.room_name}<div className="muted">{b.guest_contact} · {b.guests} guest(s) · <span className={`pill s-${b.status}`}>{LABEL[b.status]}</span></div></div>
          <div className="actions">{render(b)}</div>
        </div>
      ))}
      {!rows.length && <p className="muted">Nothing for today.</p>}
    </div>
  );

  return (
    <div className="stack">
      <Section title="Arrivals today" rows={data.arrivals} render={(b) =>
        b.status === 'pending' ? <button className="primary" onClick={() => setStatus(b, 'confirmed')}>Confirm</button>
        : b.status === 'confirmed' ? <button className="primary" onClick={() => setStatus(b, 'checked_in')}>Check in</button> : null} />
      <Section title="Departures today" rows={data.departures} render={(b) => <button className="primary" onClick={() => setStatus(b, 'checked_out')}>Check out</button>} />
    </div>
  );
}
