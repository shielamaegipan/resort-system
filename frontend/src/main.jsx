import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './topnav.css';

async function start() {
  if ('serviceWorker' in navigator) {
    if (import.meta.env.DEV) {
      // Keep push subscriptions across refreshes, but bypass fetch caching in dev.
      await navigator.serviceWorker.register('/sw.js?mode=development', { updateViaCache: 'none' });
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith('resort-')).map((key) => caches.delete(key)));
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
