import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

/**
 * Data boundary. public/bank/ is generated, never committed, and Vite copies public/ into dist/ verbatim.
 * To stop a stale private-bank export from leaking into a sample build:
 *  1. buildStart: always regenerate public/bank from the CURRENT environment
 *     (sample unless ITEMBANK_DIR is set), even when `vite build` is run directly.
 *  2. closeBundle: fail the build if dist/bank does not match the intended mode.
 */
function bankBoundary(): Plugin {
  const wantPrivate = !!process.env.ITEMBANK_DIR;
  return {
    name: 'bank-boundary',
    buildStart() {
      execFileSync(process.execPath, ['scripts/build-bank.mjs', 'public/bank'], { stdio: 'inherit' });
    },
    closeBundle() {
      const p = 'dist/bank/index.json';
      if (!fs.existsSync(p)) return; // dev server: nothing written to dist
      const idx = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (!wantPrivate && idx.sample !== true) {
        fs.rmSync('dist', { recursive: true, force: true });
        throw new Error('bank-boundary: sample build contains non-sample bank data; dist/ removed');
      }
      console.log(`bank-boundary: dist/bank is ${idx.sample ? 'PUBLIC SAMPLE' : 'PRIVATE (do not publish)'}`);
    },
  };
}

// base './' so the build works from any sub-path (Cloudflare preview, artifact preview).
export default defineConfig({ plugins: [bankBoundary(), react()], base: './', build: { chunkSizeWarningLimit: 800 } });
