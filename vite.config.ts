import { defineConfig, type Plugin } from 'vitest/config';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// The only hosts the app may contact (docs/ARCHITECTURE.md, "Network").
export const CONNECT_HOSTS = ['https://api.anthropic.com', 'https://api.nal.usda.gov'];

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${CONNECT_HOSTS.join(' ')}`,
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** Production only: the CSP meta tag (dev needs the HMR socket) and a service worker that
 * precaches this build's files under a version derived from their names. */
function pwa(): Plugin {
  return {
    name: 'diet-pwa',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<!--csp-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
    generateBundle(_opts, bundle) {
      // Fonts: only the Latin subsets are precached; others load on demand if ever used.
      const files = Object.keys(bundle).filter(f => !f.endsWith('.map') && (!f.endsWith('.woff2') || /-latin-(opsz|wght)-/.test(f)));
      const extra = ['./', 'index.html', 'manifest.webmanifest', 'boot.js', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
      const list = [...new Set([...extra, ...files])];
      const version = createHash('sha256').update(pkg.version + list.join('|')).digest('hex').slice(0, 12);
      const sw = readFileSync(new URL('./src/sw.template.js', import.meta.url), 'utf8')
        .replace('__VERSION__', version)
        .replace('__FILES__', JSON.stringify(list));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
    },
  };
}

export default defineConfig({
  plugins: [preact(), pwa()],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 4096,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
