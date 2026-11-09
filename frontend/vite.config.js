import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': target,
      '/socket.io': { target, ws: true },
    },
  },
  preview: {
    proxy: {
      '/api': target,
      '/socket.io': { target, ws: true },
    },
  },
});
