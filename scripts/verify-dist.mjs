// Runs after the build (npm run check): the shipped page must carry the exact Content-Security-Policy,
// allow only the hosts in network.json, and allow inline styles only by their hashes.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const html = readFileSync('dist/index.html', 'utf8');
const hosts = JSON.parse(readFileSync('network.json', 'utf8')).connect;
const fail = msg => { console.error(`verify-dist: ${msg}`); process.exit(1); };

const metas = [...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/g)];
if (metas.length !== 1) fail(`expected one CSP meta tag, found ${metas.length}`);
const policy = Object.fromEntries(metas[0][1].split(';').map(d => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));

const want = ["'self'", ...hosts];
if (JSON.stringify(policy['connect-src']) !== JSON.stringify(want)) fail(`connect-src is ${policy['connect-src']?.join(' ')}, expected ${want.join(' ')}`);
if (JSON.stringify(policy['script-src']) !== JSON.stringify(["'self'"])) fail(`script-src is ${policy['script-src']?.join(' ')}`);
if (policy['style-src']?.includes("'unsafe-inline'")) fail("style-src allows 'unsafe-inline'");
const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
for (const h of styles) if (!policy['style-src']?.includes(h)) fail(`style-src is missing ${h}`);
if (/<script(?![^>]*\bsrc=)[^>]*>/.test(html)) fail('an inline <script> would be blocked by script-src');
if (html.includes('<!--csp-->')) fail('the CSP placeholder was not replaced');
console.log(`verify-dist: CSP ok (connect-src ${hosts.join(', ')}; ${styles.length} inline style hash)`);
