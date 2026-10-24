// Where the Claude key and photos leave the device (owner-gated, AGENTS.md). Direct browser calls
// to api.anthropic.com only; a relay replaces this before any public release (ARCHITECTURE §7).
import Anthropic from '@anthropic-ai/sdk';

let cached: { key: string; client: Anthropic } | null = null;

export function claude(key: string): Anthropic {
  if (cached?.key === key) return cached.client;
  // dangerouslyAllowBrowser sends anthropic-dangerous-direct-browser-access; the key is the
  // person's own and stays on their device.
  // One retry: the SDK waits out a 429's retry-after with no cap, so more retries can leave a scan
  // silent for minutes; after one, the person sees "Too many requests".
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });
  cached = { key, client };
  return client;
}
