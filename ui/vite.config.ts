import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 24681,
    proxy: {
      '/api': 'http://localhost:24680',
      '/ws': {
        target: 'ws://localhost:24680',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../dist/ui',
    emptyOutDir: true,
  },
});
