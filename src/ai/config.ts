// One place for model choices. Accuracy comes first (owner, 2026-10-24), so analysis runs on the
// strongest Opus at high effort; tune after the first real-device timings and costs.
export const MODEL = 'claude-opus-5-5';
export const EFFORT = 'high' as const;
export const MAX_TOKENS = 32000;
/** Server-side refusal fallback ("default" picks the fallback model by refusal category). */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Long edge of the photo sent for analysis, and of the thumbnail kept in the log. */
export const IMAGE_EDGE = 1568;
export const THUMB_EDGE = 320;

/** USD per million tokens for MODEL, from Anthropic's price table (checked 2026-10-06). Used only
 * for the usage estimate in Profile. Cache writes are taken at 1.25x input. */
export const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 } as const;

export const KEY_PAGES = {
  claude: 'https://platform.claude.com/settings/keys',
  usda: 'https://fdc.nal.usda.gov/api-key-signup/',
} as const;
