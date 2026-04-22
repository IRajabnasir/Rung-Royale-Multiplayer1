import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // Capacitor packages web build into dist/ for wrapping
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 1500,
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
