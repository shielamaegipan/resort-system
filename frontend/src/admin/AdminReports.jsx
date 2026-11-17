import { useState } from 'react';
import { Analytics } from '../features/Pages.jsx';
import { manilaToday, money, useData } from './data.jsx';
import { QueryState } from './ui.jsx';

export default function AdminReports() {
  const [month, setMonth] = useState(manilaToday().slice(0, 7));
  const [year, number] = month.split('-').map(Number);
  const range = (y, m) => {
    const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return `preset=custom&start=${start}&end=${end}`;
  };
  const current = useData('comparison-current', `/advanced/analytics?${range(year, number)}`);
  const previous = useData('comparison-previous', `/advanced/analytics?${range(year, number - 1)}`);
  return <div className="stack">
    <section className="card pad"><h2>Monthly comparison</h2><label>Month<input type="month" required value={month} onChange={e => { if (e.target.value) setMonth(e.target.value); }}/></label>
      <p className="muted">Full calendar months. The current month includes data recorded so far.</p>
      <QueryState query={current}>{a => <QueryState query={previous}>{b => <div className="table-wrap"><table><thead><tr><th>Measure</th><th>{a.start} to {a.end}</th><th>{b.start} to {b.end}</th><th>Change</th></tr></thead><tbody>{[
        ['Net revenue', a.revenue, b.revenue, money],
        ['Bookings', a.bookings.total, b.bookings.total, v => Number(v).toLocaleString('en-PH')],
        ['Occupancy', a.occupancy.rate, b.occupancy.rate, v => `${v}%`],
      ].map(([label, now, before, format]) => <tr key={label}><th scope="row">{label}</th><td>{format(now)}</td><td>{format(before)}</td><td>{label === 'Occupancy' ? `${(Number(now) - Number(before)).toFixed(2)} percentage points` : Number(before) === 0 ? Number(now) === 0 ? 'No change' : 'No previous baseline' : `${((Number(now) - Number(before)) / Math.abs(Number(before)) * 100).toFixed(1)}%`}</td></tr>)}</tbody></table></div>}</QueryState>}</QueryState>
    </section>
    <section><h2>Detailed reports and exports</h2><p className="muted">Choose a date range below to review revenue, occupancy and booking trends, then export PDF, Excel or CSV.</p><Analytics/></section>
  </div>;
}
