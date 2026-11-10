import { useEffect, useState } from 'react';
import { adminFetch, peso, styles as s } from './adminApi';

function Stat({ label, value }) {
  return (
    <div style={s.card}>
      <p style={s.label}>{label}</p>
      <p style={s.value}>{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminFetch('/api/dashboard').then(setD).catch((e) => setError(e.message));
  }, []);

  if (error) return <div style={s.error}>{error}</div>;
  if (!d) return <p>Loading...</p>;

  return (
    <div style={s.page}>
      <h1 style={s.title}>Dashboard</h1>
      <div style={s.grid}>
        <Stat label="Revenue this month" value={peso(d.month_revenue)} />
        <Stat label="Bookings this month" value={d.month_bookings} />
        <Stat label="Pending bookings" value={d.pending_bookings} />
        <Stat label="Arrivals today" value={d.arrivals_today} />
        <Stat label="Departures today" value={d.departures_today} />
        <Stat label="Occupied rooms" value={`${d.occupied_today} / ${d.rooms.total}`} />
        <Stat label="Rooms available" value={d.rooms.available} />
        <Stat label="Rooms in maintenance" value={d.rooms.maintenance} />
        <Stat label="Staff accounts" value={d.users.staff} />
        <Stat label="Guests" value={d.users.guests} />
      </div>

      <div style={s.panel}>
        <h2 style={{ marginTop: 0 }}>Recent bookings</h2>
        <table style={s.table}>
          <thead>
            <tr>
              {['Guest', 'Room', 'Check-in', 'Check-out', 'Total', 'Status'].map((h) => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.recent_bookings.length === 0 && (
              <tr><td style={s.td} colSpan={6}>No bookings yet.</td></tr>
            )}
            {d.recent_bookings.map((b) => (
              <tr key={b.id}>
                <td style={s.td}>{b.guest_name}</td>
                <td style={s.td}>{b.room_name}</td>
                <td style={s.td}>{b.check_in}</td>
                <td style={s.td}>{b.check_out}</td>
                <td style={s.td}>{peso(b.total_price)}</td>
                <td style={s.td}>{String(b.status).replace('_', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
