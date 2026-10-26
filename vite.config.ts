import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { prerenderPlugin } from './scripts/prerenderPlugin.ts';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), prerenderPlugin()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
