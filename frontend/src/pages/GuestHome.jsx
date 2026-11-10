import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { peso, LABEL } from './Bookings.jsx';
import './staff.css';
import './guest.css';

export default function GuestHome({ user, notice, goTo }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/bookings').then(setRows).catch(() => {}); }, []);
  const today = new Date().toLocaleDateString('en-CA');
  const upcoming = rows
    .filter((b) => ['pending', 'confirmed', 'checked_in'].includes(b.status) && b.check_out >= today)
    .sort((a, b) => a.check_in.localeCompare(b.check_in))[0];

  return (
    <>
      <div className="card hero">
        <h2>Welcome, {user.name}!</h2>
        <p className="muted">Find a room, book your stay and chat with our front desk.</p>
        <div className="quick">
          <button className="primary" onClick={() => goTo('booking')}>Book a room</button>
          <button onClick={() => goTo('rooms')}>See rooms</button>
          <button onClick={() => goTo('services')}>Resort services</button>
          <button onClick={() => goTo('chat')}>Chat with staff</button>
        </div>
      </div>
      <div className="card pad">
        <h3>Your next stay</h3>
        {upcoming ? (
          <>
            <div className="billrow"><span>Room</span><strong>{upcoming.room_name}</strong></div>
            <div className="billrow"><span>Dates</span><span>{upcoming.check_in} → {upcoming.check_out}</span></div>
            <div className="billrow"><span>Guests</span><span>{upcoming.guests}</span></div>
            <div className="billrow"><span>Total</span><span>{peso(upcoming.total_price)}</span></div>
            <div className="billrow"><span>Status</span><span className={`pill s-${upcoming.status}`}>{LABEL[upcoming.status]}</span></div>
          </>
        ) : <p className="muted">You have no upcoming booking yet.</p>}
      </div>
    </>
  );
}
