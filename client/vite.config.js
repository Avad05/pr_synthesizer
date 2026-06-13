import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forward /api/* calls to the Express server during development
      '/api': 'http://localhost:5000',
    },
  },
});
