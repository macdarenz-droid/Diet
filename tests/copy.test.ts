// UI copy rules (AGENTS.md "UI copy" and "No AI wording"). Shared, add-only: add phrases or checks,
// never remove one.
import { describe, expect, it } from 'vitest';

const files = import.meta.glob(['/src/**/*.tsx', '/src/**/*.ts', '/index.html', '/public/manifest.webmanifest'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

// The model prompt lists phrases the model must avoid; it is not UI copy.
const ui = Object.entries(files).filter(([path]) => !path.endsWith('/src/ai/prompts.ts') && !path.endsWith('/tests/copy.test.ts'));

const BANNED = [
  /at a glance/i,
  /\bunlock/i,
  /supercharg/i,
  /seamless/i,
  /your journey/i,
  /powered by ai/i,
  /ai[- ]powered/i,
  /\bsmart (choice|swap|pick|suggestion)/i,
  /\bmagic/i,
  /\bguilt[- ]free/i,
  /\bdelicious/i,
  /\bhealthier option/i,
  /\boops\b/i,
  /\bwhoops\b/i,
  /let'?s (get started|go|dive)/i,
  /\bin plain words\b/i,
  /not medical advice/i,
  /\bsparkle/i,
];

/** Strings a person can read: JSX text and quoted literals that contain a letter and a space. */
function visible(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) out.push(m[1]!.trim());
  for (const m of src.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*[A-Za-z]+ [A-Za-z][^'"`\n]*?)\1/g)) out.push(m[2]!);
  return out.filter(Boolean);
}

describe('UI copy', () => {
  it('scans the app sources', () => {
    expect(ui.length).toBeGreaterThan(20);
  });

  it.each(BANNED.map(r => [r.source, r] as const))('never uses %s', (_name, re) => {
    const hits = ui.filter(([, src]) => re.test(src)).map(([p]) => p);
    expect(hits).toEqual([]);
  });

  it('has no emoji or sparkle symbols', () => {
    const re = /[\u{1F300}-\u{1FAFF}\u{2728}\u{2B50}\u{1F31F}]/u;
    expect(ui.filter(([, src]) => re.test(src)).map(([p]) => p)).toEqual([]);
  });

  it('has no exclamation marks in visible text', () => {
    const hits = ui.flatMap(([p, src]) => visible(src).filter(t => /[A-Za-z]!(\s|$)/.test(t)).map(t => `${p}: ${t}`));
    expect(hits).toEqual([]);
  });

  it('keeps section headings to one to three words, with no leading article or question', () => {
    const titles = ui.flatMap(([, src]) => [...src.matchAll(/<Section title="([^"]+)"/g), ...src.matchAll(/<h2>([^<{]+)<\/h2>/g)].map(m => m[1]!));
    expect(titles.length).toBeGreaterThan(8);
    for (const t of titles) {
      expect(t.split(/\s+/).length, t).toBeLessThanOrEqual(3);
      expect(t, t).not.toMatch(/^(The|This|About|What|How)\b/);
      expect(t, t).not.toMatch(/[?.!]$/);
    }
  });
});
