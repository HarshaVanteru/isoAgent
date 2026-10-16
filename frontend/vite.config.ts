/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const port = Number(env.VITE_DEV_PORT || 5173);
  const proxy = { '/api': env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000' };
  return {
    plugins: [react()],
    // strictPort: a silently shifted port would no longer match the backend CORS_ORIGINS.
    server: { host: '127.0.0.1', port, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port, proxy },
    test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
  };
});
