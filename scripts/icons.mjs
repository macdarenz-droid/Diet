// Renders the PWA icons from one SVG with the preinstalled Chromium (Playwright).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';

// Playwright is preinstalled outside this project (never npm-installed here: another version would
// not find the bundled Chromium), so it is loaded through require's global lookup.
const { chromium } = createRequire(import.meta.url)('playwright');

// The Nuance mark: an N whose diagonal fades, a shade between two solid strokes.
const mark = (scale) => `
  <defs><linearGradient id="nd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7f8f8"/><stop offset="1" stop-color="#f7f8f8" stop-opacity=".22"/></linearGradient></defs>
  <g transform="translate(256 256) scale(${scale}) translate(-16 -16)" fill="none" stroke-linecap="round">
    <path d="M10 9.5v13" stroke="#f7f8f8" stroke-width="3.2"/>
    <path d="M22 9.5v13" stroke="#f7f8f8" stroke-width="3.2"/>
    <path d="M10.4 10.2 21.6 21.8" stroke="url(#nd)" stroke-width="3.2"/>
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
  ['public/icon-192.png', 192, svg(true, 9.5)],
  ['public/icon-512.png', 512, svg(true, 9.5)],
  ['public/icon-maskable-512.png', 512, svg(false, 7.4)],
  ['public/apple-touch-icon.png', 180, svg(false, 8.6)],
];

// Android launcher icons (adaptive, API 26+): a transparent foreground whose mark sits inside the
// 66 dp safe zone of the 108 dp canvas, on the #08090a background colour set by scripts/android.sh.
const fg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">${mark(6.6)}</svg>`;
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENSITIES)) {
  mkdirSync(`native/res/mipmap-${d}`, { recursive: true });
  out.push([`native/res/mipmap-${d}/ic_launcher_foreground.png`, Math.round(108 * k), fg(Math.round(108 * k))]);
  out.push([`native/res/mipmap-${d}/ic_launcher.png`, Math.round(48 * k), svg(true, 9.5)]);
  out.push([`native/res/mipmap-${d}/ic_launcher_round.png`, Math.round(48 * k), svg(true, 9.5).replace(/rx="11[02](\.5)?"/g, 'rx="256"')]);
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [file, size, s] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${s.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  writeFileSync(file, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
  console.log('wrote', file);
}
await browser.close();
