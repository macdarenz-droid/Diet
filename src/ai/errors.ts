// Kept apart from analyze.ts so screens can name failures without loading the Claude SDK, which
// is fetched on the first scan instead of at start-up.
export type Stage = 'send' | 'think' | 'items' | 'swaps';

export type FailKind = 'auth' | 'rate' | 'busy' | 'network' | 'refusal' | 'truncated' | 'invalid' | 'denied' | 'aborted' | 'unknown';

export interface Usage { input: number; output: number; cacheRead: number; cacheWrite: number }

/** usage is set when the call completed and was billed but its answer was unusable. */
export class AnalysisError extends Error {
  constructor(public readonly kind: FailKind, message: string, public readonly usage?: Usage) { super(message); }
}
