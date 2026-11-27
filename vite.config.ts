import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// Static course assets (data/, pglite/, jsrunner.js) live in public/ and are served unchanged
// at the same relative paths as in the original single-file course.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: { include: ['src/**/*.test.ts', 'builder/**/*.test.ts'], environment: 'node' },
});
