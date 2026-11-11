import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { enablePush } from '../push.js';
import './staff.css';
import './guest.css';

const TEXT = {
  pending: (b) => `Your booking for ${b.room_name} was sent and is waiting for confirmation.`,
  confirmed: (b) => `Your booking for ${b.room_name} (${b.check_in} → ${b.check_out}) is confirmed.`,
  checked_in: (b) => `You are checked in to ${b.room_name}. Enjoy your stay!`,
  checked_out: (b) => `You checked out of ${b.room_name}. Thank you for staying with us!`,
  cancelled: (b) => `Your booking for ${b.room_name} (${b.check_in} → ${b.check_out}) was cancelled.`,
};

export default function GuestNotifications({ notice }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/bookings').then(setRows).catch((e) => notice(e.message)); }, [notice]);
  const sorted = [...rows].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const enable = async () => { try { await enablePush(); notice('Notifications enabled'); } catch (e) { notice(e.message); } };

  return (
    <>
      <div className="toolbar">
        <button className="primary" onClick={enable}>Enable push notifications</button>
        <span className="muted">Get alerts for chat messages and booking updates on this device.</span>
      </div>
      <div className="card">
        {sorted.map((b) => (
          <div key={b.id} className="note-item">
            <div>{(TEXT[b.status] || (() => 'Booking updated.'))(b)}</div>
            <div className="t">{String(b.updated_at).replace('T', ' ').slice(0, 16)}</div>
          </div>
        ))}
        {!sorted.length && <div className="note-item muted">No notifications yet.</div>}
      </div>
    </>
  );
}
