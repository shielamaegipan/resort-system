import './AboutResort.css';

// Edit your resort details here
const RESORT = {
  name: 'Resort',
  tagline: 'A relaxing beachfront getaway for families, couples and groups of friends.',
  intro: 'Enjoy comfortable rooms, friendly service and the calm of the sea.',
  highlights: [
    { icon: 'bed', title: 'Rooms for everyone', text: 'Rooms, cottages and villas for every group size.' },
    { icon: 'boat', title: 'Island activities', text: 'Island hopping, massage and pickup services.' },
    { icon: 'chat', title: 'Front desk chat', text: 'Message our staff anytime for quick questions.' },
  ],
  checkIn: '2:00 PM',
  checkOut: '12:00 NN',
  address: 'Your resort address here',
  phone: '0997 920 7477',
};

const PHOTOS = [
  { src: '/images/home/gallery-3.jpg', alt: 'Palm trees and beach umbrellas by the sea' },
  { src: '/images/home/gallery-1.jpg', alt: 'Palm fronds over the pool and lounge chairs' },
  { src: '/images/home/gallery-6.jpg', alt: 'Pool with palm trees and turquoise water' },
];

const ICONS = {
  bed: <path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 15h18M7 9V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M3 18v2M21 18v2" />,
  boat: <path d="M3 17h18l-2 4H5l-2-4zM12 3v11M12 4l6 8h-6M12 6L7 12h5" />,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  clock: <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
  pin: <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export default function AboutResort() {
  const R = RESORT;
  return (
    <div className="ab">
      <section className="ab-hero">
        <img src="/images/home/hero-white.jpg" alt="Turquoise lagoon seen from the resort pool" />
        <div className="ab-shade" />
        <div className="ab-hero-text">
          <p className="ab-kicker">About us</p>
          <h2>{R.name}</h2>
          <p>{R.tagline}</p>
        </div>
      </section>

      <div className="ab-layout">
        <div className="ab-main">
          <section className="ab-card">
            <h3>Our Resort</h3>
            <p className="ab-lead">{R.tagline} {R.intro}</p>
          </section>

          <div className="ab-highlights">
            {R.highlights.map((h) => (
              <div className="ab-high" key={h.title}>
                <span className="ab-ico"><Icon name={h.icon} /></span>
                <h4>{h.title}</h4>
                <p>{h.text}</p>
              </div>
            ))}
          </div>

          <div className="ab-photos">
            {PHOTOS.map((p) => <img key={p.src} src={p.src} alt={p.alt} loading="lazy" />)}
          </div>
        </div>

        <aside className="ab-card ab-info">
          <h3>Good to know</h3>
          <ul>
            <li><span className="ab-ico sm"><Icon name="clock" /></span><div><small>Check-in</small><strong>{R.checkIn}</strong></div></li>
            <li><span className="ab-ico sm"><Icon name="clock" /></span><div><small>Check-out</small><strong>{R.checkOut}</strong></div></li>
            <li><span className="ab-ico sm"><Icon name="pin" /></span><div><small>Address</small><strong>{R.address}</strong></div></li>
            <li><span className="ab-ico sm"><Icon name="phone" /></span><div><small>Phone</small><strong><a href={`tel:${R.phone.replace(/\s/g, '')}`}>{R.phone}</a></strong></div></li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
