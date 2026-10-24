// One analysis: a single streamed Claude call that returns items, questions and swaps as JSON.
import Anthropic from '@anthropic-ai/sdk';
import type { Analysis, Profile } from '@/core/models';
import { claude } from './transport';
import { idleWatch } from '@/core/abort';

/** Until the first event (the request, a retry and the first tokens) and between events after that. */
export const FIRST_EVENT_MS = 120_000;
export const IDLE_MS = 60_000;
import { EFFORT, FALLBACK_BETA, MAX_TOKENS, MODEL } from './config';
import { SYSTEM, userText, type Answer, type Edits } from './prompts';
import { InvalidOutput, SCHEMA, parseAnalysis } from './schema';

import { AnalysisError, type Stage, type Usage } from './errors';

export { AnalysisError };
export type { FailKind, Stage, Usage } from './errors';

export interface AnalyzeInput {
  image?: { data: string; mediaType: 'image/jpeg' };
  text?: string;
  note?: string;
  answers?: Answer[];
  edits?: Edits;
  profile: Profile;
}

export interface AnalyzeResult { analysis: Analysis & { found: boolean }; usage: Usage }

type Client = Pick<Anthropic, 'beta'>;

export function buildRequest(input: AnalyzeInput) {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (input.image) {
    content.push({ type: 'image', source: { type: 'base64', media_type: input.image.mediaType, data: input.image.data }, cache_control: { type: 'ephemeral' } });
  }
  content.push({ type: 'text', text: userText(input.profile, { text: input.text, note: input.note, answers: input.answers, edits: input.edits, hasImage: !!input.image }) });
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // Summarised thinking is never shown; it is asked for because it streams while the model thinks,
    // which keeps the stall watchdog fed. Thinking is billed the same either way.
    thinking: { type: 'adaptive' as const, display: 'summarized' as const },
    output_config: { effort: EFFORT, format: { type: 'json_schema' as const, schema: SCHEMA } },
    betas: [FALLBACK_BETA],
    fallbacks: 'default' as const,
    system: [{ type: 'text' as const, text: SYSTEM, cache_control: { type: 'ephemeral' as const } }],
    messages: [{ role: 'user' as const, content }],
  };
}

function failFrom(e: unknown): AnalysisError {
  if (e instanceof AnalysisError) return e;
  if (e instanceof Anthropic.APIUserAbortError) return new AnalysisError('aborted', 'Cancelled');
  if (e instanceof Anthropic.AuthenticationError) return new AnalysisError('auth', 'Key not accepted');
  if (e instanceof Anthropic.PermissionDeniedError) return new AnalysisError('denied', 'Access denied');
  if (e instanceof Anthropic.RateLimitError) return new AnalysisError('rate', 'Rate limited');
  if (e instanceof Anthropic.APIConnectionError) return new AnalysisError('network', 'Connection failed');
  if (e instanceof Anthropic.InternalServerError) return new AnalysisError('busy', 'Service busy');
  if (e instanceof Anthropic.APIError) return new AnalysisError('unknown', `Request failed (${e.status ?? 'no status'})`);
  // fetch reports a dropped or refused connection as a TypeError; so does a stream cut mid-way.
  if (e instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false)) return new AnalysisError('network', 'Connection lost');
  if (e instanceof InvalidOutput || e instanceof SyntaxError) return new AnalysisError('invalid', 'Unreadable response');
  return new AnalysisError('unknown', e instanceof Error ? e.message : String(e));
}

export async function analyze(input: AnalyzeInput, key: string, opts: { signal?: AbortSignal; onStage?: (s: Stage) => void; client?: Client } = {}): Promise<AnalyzeResult> {
  const client = opts.client ?? claude(key);
  let stage: Stage = 'send';
  const to = (s: Stage) => { if (s !== stage) { stage = s; opts.onStage?.(s); } };
  opts.onStage?.('send');
  // The SDK's own timeout stops once headers arrive; a stream that then goes quiet (a network
  // switch, the phone asleep) would wait for ever, so silence ends it as a connection failure.
  const watch = idleWatch(opts.signal, FIRST_EVENT_MS, IDLE_MS);
  try {
    const stream = client.beta.messages.stream(buildRequest(input), { signal: watch.signal });
    stream.on('connect', () => watch.kick());
    stream.on('streamEvent', ev => {
      watch.kick();
      if (ev.type === 'content_block_start' && ev.content_block.type === 'thinking' && stage === 'send') to('think');
    });
    stream.on('text', (_delta, snapshot) => {
      if (stage === 'send' || stage === 'think') to('items');
      if (stage === 'items' && snapshot.includes('"swaps"')) to('swaps');
    });
    const msg = await stream.finalMessage();
    const u = msg.usage;
    const usage: Usage = { input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 };
    // Billed even when the answer is unusable, so failures carry their usage for the cost figure.
    if (msg.stop_reason === 'refusal') throw new AnalysisError('refusal', 'Declined', usage);
    if (msg.stop_reason === 'max_tokens') throw new AnalysisError('truncated', 'Response cut short', usage);
    const text = msg.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('');
    let analysis: AnalyzeResult['analysis'];
    try {
      analysis = parseAnalysis(JSON.parse(text));
    } catch {
      throw new AnalysisError('invalid', 'Unreadable response', usage);
    }
    return { analysis, usage };
  } catch (e) {
    if (opts.signal?.aborted) throw new AnalysisError('aborted', 'Cancelled');
    if (watch.stalled()) throw new AnalysisError('network', 'The connection went quiet');
    throw failFrom(e);
  } finally {
    watch.clear();
  }
}
