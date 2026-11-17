import { Component, useEffect, useId, useRef, useState } from 'react';
import { labels } from './data.jsx';

const paths = {
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  rooms: 'M3 20V5h18v15 M3 12h18 M7 8h3 M14 8h3 M3 17h18',
  bookings: 'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h3 M14 14h2 M8 17h3',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  reports: 'M4 3v18h17 M8 17v-5 M13 17V7 M18 17V4',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  menu: 'M4 6h16 M4 12h16 M4 18h16', close: 'M6 6l12 12 M18 6 6 18',
  plus: 'M12 5v14 M5 12h14', search: 'M21 21l-5-5 M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14',
  arrow: 'M5 12h14 M13 6l6 6-6 6', logout: 'M9 5H4v14h5 M10 12h11 M17 8l4 4-4 4',
  wallet: 'M3 6h17v14H3z M3 6V3h15v3 M15 11h6v5h-6z',
  payments: 'M3 6h17v14H3z M3 6V3h15v3 M15 11h6v5h-6z',
  operations: 'M14 6l4-4 4 4-4 4 M4 20l11-11 M3 17l4 4 M4 3l3 3',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',
};
export function Icon({ name, size = 20 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.dashboard} /></svg>; }
export function Badge({ status }) { return <span className={`admin-badge s-${status}`}>{labels[status] || status}</span>; }
export function QueryState({ query, children }) {
  if (query.isPending) return <div className="admin-skeletons" role="status" aria-label="Loading data">{[1, 2, 3].map((n) => <div className="admin-skeleton" key={n} />)}</div>;
  if (query.isError) return <div className="admin-empty" role="alert"><h3>We couldn’t load this data</h3><p>{query.error.message}</p><button onClick={() => query.refetch()}>Try again</button></div>;
  return <>{query.isFetching && <span className="admin-updating" role="status">Updating…</span>}{children(query.data)}</>;
}
export function Empty({ title = 'Nothing here yet', text = 'New records will appear here as they are added.' }) { return <div className="admin-empty"><Icon name="search" size={28} /><h3>{title}</h3><p>{text}</p></div>; }
export function Dialog({ title, onClose, children, busy = false }) {
  const ref = useRef();
  const titleId = useId();
  useEffect(() => { const element = ref.current; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={ref} className="admin-dialog" aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="admin-dialog-head"><h2 id={titleId}>{title}</h2><button type="button" className="admin-icon" aria-label="Close dialog" disabled={busy} onClick={onClose}><Icon name="close" /></button></div>
    {children}
  </dialog>;
}
export function Confirm({ title, text, action = 'Confirm', onConfirm, onClose, busy }) {
  return <Dialog title={title} onClose={onClose} busy={busy}><p className="admin-help">{text}</p><div className="admin-dialog-actions"><button onClick={onClose} disabled={busy}>Go back</button><button className="danger" onClick={onConfirm} disabled={busy}>{busy ? 'Saving…' : action}</button></div></Dialog>;
}
export function Paged({ rows, children, size = 10 }) {
  const [requestedPage, setPage] = useState(1);
  const total = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(requestedPage, total);
  useEffect(() => setPage(1), [rows.length]);
  return <>{children(rows.slice((page - 1) * size, page * size))}{rows.length > 0 && <div className="admin-pagination"><span>{rows.length} records · Page {page} of {total}</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button disabled={page >= total} onClick={() => setPage(page + 1)}>Next</button></div></div>}</>;
}
export class AdminBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('Admin interface error:', error); }
  render() { return this.state.failed ? <div className="admin-empty" role="alert"><h2>This page encountered a problem</h2><p>Your saved records are safe. Reopen the page to try again.</p><button onClick={() => this.setState({ failed: false })}>Reopen page</button></div> : this.props.children; }
}
