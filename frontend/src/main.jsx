import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './topnav.css';

async function start() {
  if ('serviceWorker' in navigator) {
    if (import.meta.env.DEV) {
      // A production worker must not serve stale Vite modules during development.
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith('resort-')).map((key) => caches.delete(key)));
      }
      if (navigator.serviceWorker.controller) {
        window.location.reload();
        return;
      }
    } else {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  createRoot(document.getElementById('root')).render(<App />);
}

start().catch((error) => {
  console.error('Could not initialize browser storage:', error);
  createRoot(document.getElementById('root')).render(<App />);
});
