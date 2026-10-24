// Renders every screen at phone size (390 × 844, 2x) into screenshots/, end to end against the
// production build, with Claude mocked at the network layer. Fails on any console error,
// page error or blocked request (a Content-Security-Policy violation shows up here).
//
//   npm run build && npm run screens [-- path/to/food-photo.jpg]
//
// Without a photo the scan runs from a typed description. The mock data below is for screenshots
// only; its numbers are not nutrition claims.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const { chromium } = createRequire(import.meta.url)('playwright');
const photo = process.argv[2] && existsSync(process.argv[2]) ? process.argv[2] : null;
// SCREENS_PORT and SCREENS_OUT let parallel runs (reviewers in worktrees) avoid each other.
const OUT = process.env.SCREENS_OUT || 'screenshots';
const PORT = Number(process.env.SCREENS_PORT) || 4173;
mkdirSync(OUT, { recursive: true });

const n = (kcal, protein, carbs, fat, sat_fat, fibre, sugars, sodium_mg) => ({ kcal, protein, carbs, fat, sat_fat, fibre, sugars, sodium_mg });
const NOPANEL = { present: false, basis: 'per100g', serving_g: 0, energy: 0, energy_unit: 'kcal', protein: 0, carbs: 0, fat: 0, sat_fat: 0, fibre: 0, sugars: 0, sodium_mg: 0 };
const ANALYSIS = {
  found: true,
  dish: 'Chicken adobo',
  kind: 'meal',
  confidence: 'medium',
  note: 'Assumed the skin is eaten and about a quarter of the sauce.',
  items: [
    { name: 'Chicken thigh and drumstick', detail: 'braised, with skin', grams: 260, grams_low: 210, grams_high: 320, usda_query: 'chicken thigh, stewed, with skin', panel: NOPANEL, per100: n(232, 24, 0.5, 15, 4.2, 0, 0.3, 450) },
    { name: 'Adobo sauce', detail: 'soy, vinegar, garlic', grams: 60, grams_low: 30, grams_high: 100, usda_query: 'soy sauce and vinegar sauce', panel: NOPANEL, per100: n(62, 3, 6, 3, 0.8, 0.2, 4, 2400) },
    { name: 'Bay leaves', detail: 'not eaten', grams: 1, grams_low: 1, grams_high: 2, usda_query: 'bay leaf', panel: NOPANEL, per100: n(0, 0, 0, 0, 0, 0, 0, 0) },
  ],
  questions: [{ id: 'rice', text: 'Served with rice?', options: ['No rice', '1 cup', '2 cups'] }],
  swaps: [
    { title: 'Skinless thigh adobo', why: 'Same braise and sauce; taking the skin off removes most of the saturated fat.', kind: 'ingredient', keeps: ['taste', 'ingredient'], match: 'close', effort: 'low', items: [
      { name: 'Chicken thigh, skinless', grams: 230, usda_query: 'chicken thigh, stewed, meat only', per100: n(180, 26, 0.5, 8, 2.3, 0, 0.3, 420) },
      { name: 'Adobo sauce', grams: 40, usda_query: 'soy sauce and vinegar sauce', per100: n(62, 3, 6, 3, 0.8, 0.2, 4, 2400) },
    ] },
    { title: 'Breast fillet adobo', why: 'Lean breast takes the same sauce well and adds protein for less energy.', kind: 'ingredient', keeps: ['taste'], match: 'similar', effort: 'low', items: [
      { name: 'Chicken breast', grams: 230, usda_query: 'chicken breast, stewed, meat only', per100: n(151, 29, 0, 3.5, 1, 0, 0, 400) },
      { name: 'Adobo sauce', grams: 40, usda_query: 'soy sauce and vinegar sauce', per100: n(62, 3, 6, 3, 0.8, 0.2, 4, 2400) },
    ] },
    { title: 'Adobong sitaw with chicken', why: 'Half the chicken, with yard-long beans soaking up the same sauce for fibre and volume.', kind: 'dish', keeps: ['taste', 'occasion'], match: 'similar', effort: 'medium', items: [
      { name: 'Chicken breast', grams: 120, usda_query: 'chicken breast, stewed, meat only', per100: n(151, 29, 0, 3.5, 1, 0, 0, 400) },
      { name: 'Yard-long beans', grams: 160, usda_query: 'yardlong beans, cooked', per100: n(47, 2.5, 9, 0.1, 0, 3, 1, 4) },
      { name: 'Adobo sauce', grams: 40, usda_query: 'soy sauce and vinegar sauce', per100: n(62, 3, 6, 3, 0.8, 0.2, 4, 2400) },
    ] },
    { title: 'Smaller serve', why: 'Two pieces instead of three, same everything else.', kind: 'portion', keeps: ['taste', 'texture', 'ingredient', 'occasion'], match: 'close', effort: 'none', items: [
      { name: 'Chicken thigh and drumstick', grams: 170, usda_query: 'chicken thigh, stewed, with skin', per100: n(232, 24, 0.5, 15, 4.2, 0, 0.3, 450) },
      { name: 'Adobo sauce', grams: 40, usda_query: 'soy sauce and vinegar sauce', per100: n(62, 3, 6, 3, 0.8, 0.2, 4, 2400) },
    ] },
  ],
};

function sse(json) {
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const text = JSON.stringify(json);
  const chunks = text.match(/.{1,400}/gs) ?? [];
  return [
    ev('message_start', { message: { id: 'msg_mock', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1820, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 1650 } } }),
    ev('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } }),
    ev('content_block_delta', { index: 0, delta: { type: 'signature_delta', signature: 'mock' } }),
    ev('content_block_stop', { index: 0 }),
    ev('content_block_start', { index: 1, content_block: { type: 'text', text: '' } }),
    ...chunks.map(t => ev('content_block_delta', { index: 1, delta: { type: 'text_delta', text: t } })),
    ev('content_block_stop', { index: 1 }),
    ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3120 } }),
    ev('message_stop', {}),
  ].join('');
}

// Its own process group, so stopping it also stops the vite process that npx starts.
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
const stop = () => {
  try { process.kill(-server.pid, 'SIGKILL'); } catch { /* already stopped */ }
  server.stdout.destroy();
  server.stderr.destroy();
};
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview did not start')), 20000);
  server.stdout.on('data', d => { if (String(d).includes(String(PORT))) { clearTimeout(t); resolve(); } });
  server.on('exit', code => reject(new Error(`preview exited ${code}`)));
});

const problems = [];
const browser = await chromium.launch();
let shot = 0;

async function run(theme, region) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: theme === 'day' ? 'light' : 'dark', serviceWorkers: 'block' });
  await ctx.addInitScript(([theme, region]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('nuance.keys', JSON.stringify({ claude: 'mock-claude-key' }));
    localStorage.setItem('nuance.prefs', JSON.stringify({ theme, reduceMotion: false }));
    localStorage.setItem('nuance.profile', JSON.stringify({ goal: 'lose', diet: 'any', avoid: '', region, unit: region === 'AU' ? 'kJ' : 'kcal', targets: { energy: 2000, protein: 100, fibre: 30, sugars: 50, sodium: 2000 } }));
  }, [theme, region]);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') problems.push(`[${theme}] console: ${m.text()}`); });
  page.on('pageerror', e => problems.push(`[${theme}] page: ${e.message}`));
  page.on('requestfailed', r => { if (!r.url().startsWith(`http://localhost:${PORT}`)) problems.push(`[${theme}] blocked: ${r.url()}`); });

  let release;
  const held = new Promise(r => { release = r; });
  await page.route('https://api.anthropic.com/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    await held;
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' }, body: sse(ANALYSIS) });
  });

  const snap = async (name, opts = {}) => {
    await sleep(opts.wait ?? 900);
    const file = `${OUT}/${String(++shot).padStart(2, '0')}-${theme}-${name}.png`;
    await page.screenshot({ path: file, fullPage: !!opts.full });
    console.log('wrote', file);
  };

  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('.today');
  await snap('today-empty');

  await page.click('.scan-btn');
  await page.waitForSelector('.sheet.open');
  await snap('scan-sheet', { wait: 700 });

  if (photo) {
    await page.locator('.scan-sheet input[type=file]').nth(1).setInputFiles(photo);
    await page.waitForSelector('.preview');
    await snap('photo');
  } else {
    await page.click('text=Describe');
    await page.fill('textarea', 'Chicken adobo, three pieces with sauce');
  }
  await page.click('text=Analyse');
  await page.waitForSelector('.analysing');
  await snap('analysing', { wait: 1200 });

  release();
  await page.waitForSelector('.result .swap', { timeout: 15000 });
  await snap('result');
  await snap('result-full', { full: true, wait: 300 });

  await page.locator('.items .li').first().click();
  await page.waitForSelector('.item-sheet');
  await snap('item-sheet', { wait: 700 });
  await page.keyboard.press('Escape');
  await sleep(400);

  await page.locator('.swap-use').first().scrollIntoViewIfNeeded();
  await page.locator('.swap-use').first().click();
  await snap('swap-chosen');

  await page.click('.dock .btn.primary');
  await page.waitForSelector('.today .meal-row');
  await snap('today-logged', { wait: 1400 });
  await snap('today-full', { full: true, wait: 200 });

  await page.locator('.meal-face').first().click();
  await page.waitForSelector('.sheet.open');
  await snap('meal-sheet', { wait: 800 });
  await page.keyboard.press('Escape');
  await sleep(400);

  // Gestures: drag the sheet down by its header to close it, then swipe the meal left to delete.
  await page.locator('.meal-face').first().click();
  await page.waitForSelector('.sheet.open');
  await sleep(500);
  const top = await page.locator('.sheet-top').boundingBox();
  await page.mouse.move(top.x + 40, top.y + 10);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(top.x + 40, top.y + 10 + i * 40);
  await page.mouse.up();
  await page.waitForSelector('.sheet', { state: 'detached', timeout: 3000 }).catch(() => problems.push(`[${theme}] sheet did not close on drag`));

  const row = await page.locator('.meal-face').first().boundingBox();
  await page.mouse.move(row.x + row.width - 30, row.y + row.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(row.x + row.width - 30 - i * 26, row.y + row.height / 2);
  await snap('swipe-delete', { wait: 50 });
  await page.mouse.up();
  await page.waitForSelector('.toast:has-text("Meal deleted")', { timeout: 3000 }).catch(() => problems.push(`[${theme}] swipe did not delete`));
  await snap('deleted', { wait: 500 });
  await page.click('.toast button:has-text("Undo")');
  await page.waitForSelector('.meal-row', { timeout: 3000 }).catch(() => problems.push(`[${theme}] undo did not restore`));

  await page.click('.tab >> nth=1');
  await page.waitForSelector('.profile');
  await snap('profile');
  await snap('profile-full', { full: true, wait: 200 });

  // Body details through the form, then ten weeks of history in the log for the trend and insights.
  await page.click('.seg button:has-text("Male")');
  for (const [label, v] of [['Birth year', '1986'], ['Height', '180'], ['Weight', '100']]) {
    await page.fill(`input[aria-label="${label}"]`, v);
    await page.locator(`input[aria-label="${label}"]`).blur();
  }
  await page.click('.choice:has-text("Lightly active")');
  await page.locator('.section:has(h2:text-is("Targets"))').scrollIntoViewIfNeeded();
  await snap('profile-targets');
  if (!(await page.locator('[aria-label="Automatic targets"]').count())) problems.push(`[${theme}] automatic targets did not appear`);
  await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('nuance', 2);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const t = db.transaction(['weighins', 'meals'], 'readwrite');
      const nut = kcal => ({ kcal, protein: 90, carbs: 220, fat: 70, satFat: 22, fibre: 24, sugars: 60, sodium: 2100 });
      for (let d = 70; d >= 1; d--) {
        const day = new Date(); day.setHours(7, 0, 0, 0); day.setDate(day.getDate() - d);
        t.objectStore('weighins').put({ at: day.getTime(), kg: Math.round((100 - 0.11 * (70 - d) + 0.4 * Math.sin(d * 1.7)) * 10) / 10 });
        day.setHours(13);
        t.objectStore('meals').put({ id: `seed-${d}`, at: day.getTime(), dish: 'Logged day', items: [], totals: nut(2000) });
      }
      t.oncomplete = () => { db.close(); resolve(); };
      t.onerror = () => reject(t.error);
    };
  }));
  await page.reload();
  await page.waitForSelector('.today .weigh-card');
  await page.locator('.progress').scrollIntoViewIfNeeded();
  await snap('today-progress', { wait: 1400 });
  await snap('today-progress-full', { full: true, wait: 200 });
  const spark = await page.locator('.spark').boundingBox();
  if (spark) { await page.mouse.move(spark.x + spark.width * 0.4, spark.y + spark.height / 2); await snap('progress-scrub', { wait: 300 }); }
  else problems.push(`[${theme}] no weight trend`);
  const more = page.locator('.insight[aria-expanded]').first();
  if (await more.count()) { await more.click(); await snap('insight-open', { wait: 500 }); }
  await page.click('.weigh-card .btn:has-text("Log weight")');
  await page.waitForSelector('.sheet.open .weight-form');
  await snap('weight-sheet', { wait: 700 });
  await page.keyboard.press('Escape');
  await ctx.close();
}

// Offline: once the service worker has installed, the app must start with no network.
async function offline() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push(`[offline] page: ${e.message}`));
  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => new Promise(r => setTimeout(r, 1500))));
  await ctx.setOffline(true);
  await page.reload();
  const ok = await page.waitForSelector('.today', { timeout: 5000 }).then(() => true, () => false);
  if (!ok) problems.push('[offline] app did not start without a network');
  else console.log('offline start: ok');
  await ctx.close();
}

try {
  await run('night', 'PH');
  await run('day', 'AU');
  await offline();
} finally {
  await browser.close();
  stop();
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('\nNo console errors, page errors or blocked requests.');
process.exit(0);
