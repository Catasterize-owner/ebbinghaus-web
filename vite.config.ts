import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base './' so the build works from any sub-path (Cloudflare preview, artifact preview).
export default defineConfig({ plugins: [react()], base: './', build: { chunkSizeWarningLimit: 800 } });
