import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { peso, LABEL } from './Bookings.jsx';
import './staff.css';
import './guest.css';
import './GuestHome.css';
import HomeGallery from './HomeGallery.jsx';

// Edit your resort details here
const INFO = {
  address: 'Your resort address here',
  phone: '0997 920 7477',
  checkIn: '2:00 PM',
  checkOut: '12:00 NN',
};

// SAMPLE reviews: replace them with real guest reviews
const REVIEWS = [
  { name: 'Maria S.', date: 'October 2026', title: 'A perfect weekend', text: 'We booked a room for the whole family. The staff were friendly, the pool was clean and the sea was a few steps away. We are coming back next summer.' },
  { name: 'John D.', date: 'September 2026', title: 'Great for couples', text: 'Quiet, relaxing and very well kept. Booking online was easy and the front desk answered our questions right away in the chat.' },
  { name: 'Ana L.', date: 'August 2026', title: 'Island hopping was the best', text: 'The staff arranged our island hopping tour and the pickup in minutes. The room was comfortable and the whole stay felt stress free.' },
];

const short = (t, n = 110) => (!t ? '' : t.length > n ? t.slice(0, n).trimEnd() + '…' : t);

export default function GuestHome({ user, notice, goTo }) {
  const todayStr = new Date().toLocaleDateString('en-CA');
  const [rows, setRows] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => { api('/bookings').then(setRows).catch(() => {}); }, []);
  useEffect(() => { api('/rooms').then((l) => setRooms(Array.isArray(l) ? l : [])).catch(() => {}); }, []);

  const upcoming = rows
    .filter((b) => ['pending', 'confirmed', 'checked_in'].includes(b.status) && b.check_out >= todayStr)
    .sort((a, b) => a.check_in.localeCompare(b.check_in))[0];

  const search = () => {
    if (from && to && to <= from) { notice?.('Check-out must be after check-in'); return; }
    try { sessionStorage.setItem('resort.dates', JSON.stringify({ from, to })); } catch { /* ignore */ }
    goTo('booking');
  };

  const middle = (
    <>
      {/* Check in / check out bar, sits over the bottom of the slideshow */}
      <div className="gh-datebar" role="search">
        <span className="gh-datebar-title">Check in &amp; check out</span>
        <label><span>From</span><input type="date" min={todayStr} value={from} onChange={(e) => { setFrom(e.target.value); if (to && e.target.value >= to) setTo(''); }} /></label>
        <label><span>To</span><input type="date" min={from || todayStr} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button onClick={search}>Book now →</button>
      </div>

      {/* Welcome: text on top of a photo */}
      <section className="gh-welcome">
        <div className="gh-welcome-text">
          <p className="gh-kicker">Welcome back</p>
          <h2>Welcome, {user.name}!</h2>
          <p>Find a room, book your stay and chat with our front desk.</p>
        </div>
        <div className="gh-stay">
          <h3>Your next stay</h3>
          {upcoming ? (
            <>
              <div className="gh-row"><span>Room</span><strong>{upcoming.room_name}</strong></div>
              <div className="gh-row"><span>Dates</span><strong>{upcoming.check_in} → {upcoming.check_out}</strong></div>
              <div className="gh-row"><span>Guests</span><strong>{upcoming.guests}</strong></div>
              <div className="gh-row"><span>Total</span><strong>{peso(upcoming.total_price)}</strong></div>
              <div className="gh-row"><span>Status</span><span className={`pill s-${upcoming.status}`}>{LABEL[upcoming.status]}</span></div>
            </>
          ) : (
            <p className="gh-none">You have no upcoming booking yet. Choose your dates above to book a room.</p>
          )}
        </div>
      </section>

      {/* Intro */}
      <section className="gh-section gh-intro">
        <p className="gh-eyebrow">Meet you in paradise</p>
        <h2>Unwind by the sea</h2>
        <p>A relaxing beachfront getaway for families, couples and groups of friends. Enjoy comfortable rooms, friendly service and the calm of the sea.</p>
      </section>

      <section className="gh-split">
        <div className="gh-split-text">
          <p className="gh-eyebrow left">Stay your way</p>
          <h3>Rooms, cottages and villas for every group size</h3>
          <ul>
            <li>Island hopping, massage and pickup services</li>
            <li>Front desk chat for quick questions</li>
            <li>Check-in {INFO.checkIn} · Check-out {INFO.checkOut}</li>
          </ul>
          <button className="gh-link" onClick={() => goTo('about')}>About the resort →</button>
        </div>
        <img src="/images/home/gallery-1.jpg" alt="Poolside with palm trees and lounge chairs" loading="lazy" />
      </section>

      {/* Rooms */}
      {rooms.length > 0 && (
        <section className="gh-section">
          <div className="gh-head">
            <p className="gh-eyebrow">Where you will stay</p>
            <h2>Our rooms</h2>
          </div>
          <div className="gh-rooms">
            {rooms.slice(0, 4).map((r) => (
              <article className="gh-room" key={r.id}>
                <img src={r.image_url || '/images/home/gallery-2.jpg'} alt={r.name} loading="lazy" />
                <div className="gh-room-body">
                  <h3>{r.name}</h3>
                  <p className="gh-room-meta">{r.type} · up to {r.capacity} guests</p>
                  {r.description && <p>{short(r.description)}</p>}
                  <p className="gh-price"><strong>{peso(r.price_per_night)}</strong> / night</p>
                </div>
                <button className="gh-room-btn" onClick={() => goTo('rooms')}>See details <span aria-hidden="true">→</span></button>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Featured banner */}
      <section className="gh-offer">
        <span className="gh-offer-shade" />
        <div className="gh-offer-body">
          <p className="gh-kicker">What we offer</p>
          <h2>Make every moment count</h2>
          <p>Island hopping, massage and pickup services, all arranged by our front desk.</p>
        </div>
      </section>
    </>
  );

  const after = (
    <>
      <section className="gh-section gh-reviews">
        <div className="gh-head">
          <p className="gh-eyebrow">Your opinion matters</p>
          <h2>Guest reviews</h2>
        </div>
        <div className="gh-review-grid">
          {REVIEWS.map((r) => (
            <figure className="gh-review" key={r.name}>
              <div className="gh-avatar" aria-hidden="true">{r.name[0]}</div>
              <figcaption><strong>{r.name}</strong><small>{r.date}</small></figcaption>
              <h4>{r.title}</h4>
              <blockquote>{r.text}</blockquote>
            </figure>
          ))}
        </div>
      </section>

      <footer className="gh-footer">
        <div>
          <div className="gh-foot-brand"><img src="/icon.svg" alt="" width="36" height="36" /><span>Resort</span></div>
          <p>Your beachfront escape. Book online, chat with our front desk and enjoy the sea.</p>
        </div>
        <div>
          <h4>Visit us</h4>
          <p>{INFO.address}</p>
          <p>Check-in {INFO.checkIn}<br />Check-out {INFO.checkOut}</p>
        </div>
        <div>
          <h4>Get in touch</h4>
          <p><a href={`tel:${INFO.phone.replace(/\s/g, '')}`}>{INFO.phone}</a></p>
        </div>
        <div>
          <h4>Quick links</h4>
          <p><button onClick={() => goTo('bookings')}>My bookings</button></p>
          <p><button onClick={() => goTo('notifications')}>Notifications</button></p>
        </div>
        <small className="gh-copy">© {new Date().getFullYear()} Resort. All rights reserved.</small>
      </footer>
    </>
  );

  return (
    <HomeGallery middle={middle} after={after}>
      <button className="hg-cta" onClick={() => goTo('rooms')}>See rooms</button>
      <button className="hg-ghost" onClick={() => goTo('services')}>Resort services</button>
      <button className="hg-ghost" onClick={() => goTo('chat')}>Chat with staff</button>
    </HomeGallery>
  );
}
