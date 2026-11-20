import { createContext, useContext, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { getToken } from '../api.js';

const Context = createContext();
export const money = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(value) || 0);
export const labels = { pending: 'Pending', confirmed: 'Confirmed', checked_in: 'Checked in', checked_out: 'Checked out', cancelled: 'Cancelled',no_show:'No Show' };
export const manilaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
export async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch('/api' + path, { ...options, body: options.body ? JSON.stringify(options.body) : undefined,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...options.headers }, signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) { const error = new Error(data?.error || 'Cannot reach the server. Check that the backend is running.'); error.status = response.status; throw error; }
    if (data === null) throw new Error('The server returned an unreadable response. Please try again.');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request timed out. Check the latest data before retrying.');
    throw error;
  } finally { clearTimeout(timer); }
}
export function AdminProvider({ children }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15000, refetchOnWindowFocus: true,
    retry: (count, error) => count < 1 && (!error.status || error.status >= 500) }, mutations: { retry: false } } }));
  return <QueryClientProvider client={client}><LiveProvider>{children}</LiveProvider></QueryClientProvider>;
}
function LiveProvider({ children }) {
  const client = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const seen = new Set();
    let timer;
    const socket = io('/admin', { auth: { token: getToken() }, reconnection: true, reconnectionDelayMax: 5000 });
    socket.on('connect', () => { setConnected(true); client.invalidateQueries({ queryKey: ['admin'] });window.dispatchEvent(new CustomEvent('resort:data-changed')); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('admin:change', (event) => {
      if (seen.has(event.id)) return;
      if (seen.size >= 500) seen.delete(seen.values().next().value);
      seen.add(event.id);
      window.dispatchEvent(new CustomEvent('resort:data-changed',{detail:event}));
      clearTimeout(timer);
      timer = setTimeout(() => client.invalidateQueries({ queryKey: ['admin'] }), 80);
    });
    socket.on('admin:read', () => client.invalidateQueries({ queryKey: ['admin', 'notifications'] }));
    return () => { clearTimeout(timer); socket.removeAllListeners(); socket.disconnect(); };
  }, [client]);
  return <Context.Provider value={{ connected, notify: (message, error = false) => setToast({ message, error }) }}>
    {children}
    {toast && <div className={`feature-toast ${toast.error ? 'is-error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.message}<button aria-label="Dismiss notification" onClick={() => setToast(null)}>×</button></div>}
  </Context.Provider>;
}
export const useAdmin = () => useContext(Context);
export const useData = (key, path) => useQuery({ queryKey: ['admin', key, path], queryFn: () => request(path), refetchInterval: 30000 });
export function useWrite() {
  const client = useQueryClient();
  const { notify } = useAdmin();
  return useMutation({ mutationFn: ({ path, method = 'POST', body, headers }) => request(path, { method, body, headers }),
    onSuccess: (_data, variables) => { client.invalidateQueries({ queryKey: ['admin'] });window.dispatchEvent(new CustomEvent('resort:data-changed')); if (variables.message) notify(variables.message); },
    onError: (error) => notify(error.message, true) });
}
export function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return debounced;
}
