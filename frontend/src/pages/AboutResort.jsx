import './staff.css';
import './guest.css';

// SAMPLE TEXT: change these to your real resort details.
const RESORT = {
  name: 'Our Resort',
  intro: 'A relaxing beachfront getaway for families, couples and groups of friends. Enjoy comfortable rooms, friendly service and the calm of the sea.',
  checkIn: '2:00 PM',
  checkOut: '12:00 NN',
  address: 'Your resort address here',
  phone: '09XX XXX XXXX',
  email: 'info@resort.com',
  highlights: ['Rooms, cottages and villas for every group size', 'Island hopping, massage and pickup services', 'Front desk chat for quick questions'],
};

export default function AboutResort() {
  return (
    <div className="card pad about">
      <h3>{RESORT.name}</h3>
      <p>{RESORT.intro}</p>
      <ul>{RESORT.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
      <div className="billrow"><span>Check-in</span><span>{RESORT.checkIn}</span></div>
      <div className="billrow"><span>Check-out</span><span>{RESORT.checkOut}</span></div>
      <div className="billrow"><span>Address</span><span>{RESORT.address}</span></div>
      <div className="billrow"><span>Phone</span><span>{RESORT.phone}</span></div>
      <div className="billrow"><span>Email</span><span>{RESORT.email}</span></div>
    </div>
  );
}
