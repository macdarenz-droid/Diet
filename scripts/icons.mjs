// Renders the PWA icons from one SVG with the preinstalled Chromium (Playwright).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

// Playwright is preinstalled outside this project (never npm-installed here: another version would
// not find the bundled Chromium), so it is loaded through require's global lookup.
const { chromium } = createRequire(import.meta.url)('playwright');

const mark = (scale) => `
  <g transform="translate(256 256) scale(${scale}) translate(-16 -16)">
    <path d="M9 20.5c0-5 3.3-9.5 8.2-10.6.9-.2 1.7.6 1.5 1.5C17.6 16.3 13.6 20 9 20.5Z" fill="#f7f8f8"/>
    <path d="M14 23c4.6-.4 8.5-3.4 9.6-7.8" stroke="#f7f8f8" stroke-width="1.8" stroke-linecap="round" fill="none"/>
  </g>`;

const svg = (rounded, scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="g" cx="50%" cy="0%" r="90%"><stop offset="0" stop-color="#26282d"/><stop offset="1" stop-color="#08090a"/></radialGradient>
  </defs>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#g)"/>
  <rect x="1.5" y="1.5" width="509" height="509" rx="${rounded ? 110.5 : 0}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="3"/>
  ${mark(scale)}
</svg>`;

const out = [
  ['public/icon-192.png', 192, svg(true, 11)],
  ['public/icon-512.png', 512, svg(true, 11)],
  ['public/icon-maskable-512.png', 512, svg(false, 8.5)],
  ['public/apple-touch-icon.png', 180, svg(false, 10)],
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [file, size, s] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${s.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  writeFileSync(file, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
  console.log('wrote', file);
}
await browser.close();
