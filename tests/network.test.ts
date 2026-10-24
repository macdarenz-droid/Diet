// The host list exists once (network.json) and must match what the docs promise.
import { describe, expect, it } from 'vitest';
import network from '../network.json';
import architecture from '../docs/ARCHITECTURE.md?raw';
import indexHtml from '../index.html?raw';

describe('network allow-list', () => {
  it('equals the Network table in docs/ARCHITECTURE.md', () => {
    const section = architecture.slice(architecture.indexOf('### Network'), architecture.indexOf('## 3.'));
    const documented = [...section.matchAll(/^\| `([a-z0-9.-]+)` \|/gm)].map(m => `https://${m[1]}`);
    expect(documented).toEqual(network.connect);
  });

  it('keeps the CSP placeholder in index.html', () => {
    expect(indexHtml).toContain('<!--csp-->');
  });

  it('has no inline scripts in index.html', () => {
    expect(indexHtml).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
  });
});
