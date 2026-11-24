import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      strictPort: true,
      // Same-origin proxy keeps auth cookies first-party (SameSite=Strict) in development.
      proxy: { '/api': { target: env.VITE_DEV_API_TARGET || 'http://localhost:4000', changeOrigin: false } },
    },
    build: { sourcemap: false, chunkSizeWarningLimit: 1200 },
  };
});
