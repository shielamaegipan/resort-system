// Small fetch helper used only by the Admin pages.
// If your login code stores the JWT under a different key, change TOKEN_KEY.
const TOKEN_KEY = 'token';

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export async function adminFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

export const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH');

export const styles = {
  page: { display: 'grid', gap: 20 },
  title: { fontFamily: 'Fraunces, serif', fontSize: 40, margin: 0, color: '#093e44' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 },
  card: { background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,.08)' },
  label: { fontSize: 13, color: '#5b6b6e', margin: 0 },
  value: { fontSize: 28, fontWeight: 600, margin: '6px 0 0', color: '#093e44' },
  panel: { background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,.08)', overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 15 },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e3e8e8', color: '#5b6b6e', fontWeight: 500 },
  td: { padding: '10px', borderBottom: '1px solid #f0f3f3' },
  input: { padding: '10px 12px', borderRadius: 10, border: '1px solid #cfd8d8', font: 'inherit' },
  btn: { padding: '10px 16px', borderRadius: 10, border: 0, background: '#0b5560', color: '#fff', font: 'inherit', fontWeight: 600, cursor: 'pointer' },
  btnDanger: { padding: '6px 12px', borderRadius: 8, border: '1px solid #c0392b', background: 'transparent', color: '#c0392b', font: 'inherit', cursor: 'pointer' },
  error: { background: '#fbe9e7', color: '#b3261e', padding: '12px 16px', borderRadius: 12 },
};
