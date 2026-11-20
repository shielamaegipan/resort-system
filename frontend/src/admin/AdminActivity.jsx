import { useState } from 'react';
import { useData } from './data.jsx';
import { QueryState } from './ui.jsx';
import { Pager } from '../features/Pages.jsx';

export default function AdminActivity() {
  const blank = { search: '', start: '', end: '' };
  const [filters, setFilters] = useState(blank);
  const [applied, setApplied] = useState(blank);
  const [page, setPage] = useState(1);
  const query = useData('admin-activity', `/advanced/activity?${new URLSearchParams({ ...applied, page })}`);
  return <div className="stack"><p className="muted">Review who changed resort records and when. Times are shown in Asia/Manila.</p>
    <form className="card pad searchbar" onSubmit={e => { e.preventDefault(); setApplied(filters); setPage(1); }}>
      <label>Actor, action or record<input type="search" maxLength={150} value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })}/></label>
      <label>From<input type="date" max={filters.end || undefined} value={filters.start} onChange={e => setFilters({ ...filters, start: e.target.value })}/></label>
      <label>Through<input type="date" min={filters.start} value={filters.end} onChange={e => setFilters({ ...filters, end: e.target.value })}/></label>
      <button className="primary">Apply filters</button><button type="button" onClick={() => { setFilters(blank); setApplied(blank); setPage(1); }}>Clear</button>
    </form>
    <QueryState query={query}>{d => <><div className="card table-wrap"><table><thead><tr>{['Actor', 'Action', 'Record', 'Time (Manila)', 'Details'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{d.items.map(a => <tr key={a.id}><td>{a.actor_name || 'System'}</td><td>{a.action.replaceAll('_', ' ')}</td><td>{a.entity_type} #{a.entity_id}</td><td>{new Date(/[zZ]|[+-]\d\d:\d\d$/.test(a.created_at) ? a.created_at : a.created_at.replace(' ', 'T') + 'Z').toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td><td>{a.details || '—'}</td></tr>)}{!d.items.length && <tr><td colSpan="5">No activity matches these filters.</td></tr>}</tbody></table></div><Pager data={d} setPage={setPage}/></>}</QueryState>
  </div>;
}
