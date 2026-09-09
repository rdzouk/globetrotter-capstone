import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const precache = {
  name: 'precache-react-shell',
  apply: 'build',
  writeBundle(options, bundle) {
    const worker = new URL('./dist/sw.js', import.meta.url);
    const paths = Object.keys(bundle).filter(path => /\.(js|css|woff2)$/.test(path)).map(path => JSON.stringify(`/${path}`));
    const buildId = createHash('sha256').update(paths.join(',')).digest('hex').slice(0, 12);
    writeFileSync(worker, readFileSync(worker, 'utf8').replace("'__BUILD_ASSETS__'", paths.join(', ')).replace('__BUILD_ID__', buildId));
  },
};

export default defineConfig({
  root: 'react',
  publicDir: '../static',
  plugins: [react(), precache],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { proxy: { '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true, rewrite: path => path.replace(/^\/api/, '') } } },
});