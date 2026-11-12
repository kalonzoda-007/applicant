import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Относительная база: сборка работает по любому пути (например /FATIRLOGIST/migration-preview/).
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || './',
  build: { outDir: 'dist' },
});
