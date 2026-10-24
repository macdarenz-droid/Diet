import { describe, expect, it } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { analyze, AnalysisError, buildRequest, type Stage } from '@/ai/analyze';
import { SCHEMA, panelPer100, parseAnalysis } from '@/ai/schema';
import { SYSTEM, userText } from '@/ai/prompts';
import { EFFORT, FALLBACK_BETA, MODEL } from '@/ai/config';
import { defaultProfile } from '@/core/store';

const nutrients = { kcal: 180, protein: 4, carbs: 30, fat: 5, sat_fat: 1, fibre: 1, sugars: 1, sodium_mg: 350 };
const noPanel = { present: false, basis: 'per100g', serving_g: 0, energy: 0, energy_unit: 'kcal', protein: 0, carbs: 0, fat: 0, sat_fat: 0, fibre: 0, sugars: 0, sodium_mg: 0 };
const valid = {
  found: true,
  dish: 'Garlic fried rice with egg',
  kind: 'meal',
  confidence: 'medium',
  note: 'Assumed about 1 tbsp oil.',
  items: [
    { name: 'Garlic fried rice', detail: 'pan-fried', grams: 250, grams_low: 200, grams_high: 320, usda_query: 'rice, fried', panel: noPanel, per100: nutrients },
    { name: 'Fried egg', detail: '', grams: 50, grams_low: 45, grams_high: 55, usda_query: 'egg, fried', panel: noPanel, per100: { ...nutrients, kcal: 196 } },
  ],
  questions: [{ id: 'oil', text: 'Cooked in oil or butter?', options: ['Oil', 'Butter', 'Not sure'] }],
  swaps: [
    { title: 'Plain rice and egg', why: 'Skips the frying oil.', kind: 'method', keeps: ['ingredient', 'taste'], match: 'similar', effort: 'none', items: [{ name: 'Steamed rice', grams: 200, usda_query: 'rice, white, cooked', per100: { ...nutrients, kcal: 130 } }] },
  ],
};

type Node = { type?: string; properties?: Record<string, Node>; required?: string[]; additionalProperties?: unknown; items?: Node };
function objects(n: Node, out: Node[] = []): Node[] {
  if (n.type === 'object') out.push(n);
  for (const c of Object.values(n.properties ?? {})) objects(c, out);
  if (n.items) objects(n.items, out);
  return out;
}

describe('schema', () => {
  it('is strict: every object closes additional properties and requires every key', () => {
    const all = objects(SCHEMA as Node);
    expect(all.length).toBeGreaterThan(5);
    for (const o of all) {
      expect(o.additionalProperties).toBe(false);
      expect([...(o.required ?? [])].sort()).toEqual(Object.keys(o.properties ?? {}).sort());
    }
  });
  it('writes swaps last so progress follows the stream', () => {
    const keys = Object.keys((SCHEMA as Node).properties!);
    expect(keys.at(-1)).toBe('swaps');
    expect(keys.indexOf('items')).toBeLessThan(keys.indexOf('swaps'));
  });
});

describe('parseAnalysis', () => {
  it('maps a valid response', () => {
    const a = parseAnalysis(valid);
    expect(a.found).toBe(true);
    expect(a.items[0]).toMatchObject({ name: 'Garlic fried rice', grams: 250, gramsLow: 200, gramsHigh: 320, source: 'estimate', query: 'rice, fried' });
    expect(a.items[0]!.per100).toEqual({ kcal: 180, protein: 4, carbs: 30, fat: 5, satFat: 1, fibre: 1, sugars: 1, sodium: 350 });
    expect(a.swaps[0]).toMatchObject({ id: 's0', kind: 'method', keeps: ['ingredient', 'taste'] });
    expect(a.swaps[0]!.items[0]).toMatchObject({ grams: 200, gramsLow: 200, gramsHigh: 200 });
  });

  it('converts an Australian per-100 g panel from kJ in code', () => {
    const panel = { ...noPanel, present: true, energy: 1650, energy_unit: 'kJ', protein: 9.6, carbs: 58, fat: 14, sat_fat: 2.1, fibre: 7.4, sugars: 21, sodium_mg: 30 };
    const a = parseAnalysis({ ...valid, items: [{ ...valid.items[0], panel }] });
    expect(a.items[0]!.source).toBe('label');
    expect(a.items[0]!.per100.kcal).toBeCloseTo(1650 / 4.184);
    expect(a.items[0]!.per100.protein).toBe(9.6);
    // The model's own figures stay as the estimate.
    expect(a.items[0]!.estimate.kcal).toBe(180);
    expect(a.swaps[0]!.items[0]!.source).toBe('estimate');
  });

  it('converts a per-serving panel to per 100 g, and drops one with no serving size', () => {
    const serving = { ...noPanel, present: true, basis: 'serving', serving_g: 40, energy: 160, energy_unit: 'kcal', protein: 4, carbs: 24, fat: 6, sugars: 10, sodium_mg: 120 };
    expect(panelPer100(serving)).toMatchObject({ kcal: 400, protein: 10, carbs: 60, fat: 15, sugars: 25, sodium: 300 });
    expect(panelPer100({ ...serving, serving_g: 0 })).toBeNull();
    expect(panelPer100(noPanel)).toBeNull();
  });

  it('keeps an honest zero lower bound', () => {
    const a = parseAnalysis({ ...valid, items: [{ ...valid.items[0], grams: 10, grams_low: 0, grams_high: 20 }] });
    expect(a.items[0]).toMatchObject({ grams: 10, gramsLow: 0, gramsHigh: 20 });
  });

  it('repairs ranges, clamps impossible values and drops empty items', () => {
    const a = parseAnalysis({
      ...valid,
      items: [
        { ...valid.items[0], grams: 100, grams_low: 150, grams_high: 50, per100: { ...nutrients, kcal: 5000, protein: -3 } },
        { ...valid.items[0], name: '', grams: 100 },
        { ...valid.items[0], grams: 0 },
      ],
    });
    expect(a.items).toHaveLength(1);
    expect(a.items[0]).toMatchObject({ gramsLow: 100, gramsHigh: 100 });
    expect(a.items[0]!.per100.kcal).toBe(900);
    expect(a.items[0]!.per100.protein).toBe(0);
  });

  it('limits questions to two with at least two options, and swaps to five', () => {
    const q = { id: 'x', text: 'Fried or grilled?', options: ['Fried', 'Grilled'] };
    const a = parseAnalysis({ ...valid, questions: [q, { ...q, options: ['One'] }, q, q], swaps: Array(8).fill(valid.swaps[0]) });
    expect(a.questions).toHaveLength(1);
    expect(a.swaps).toHaveLength(5);
  });

  it('reports no food', () => {
    expect(parseAnalysis({ ...valid, found: false, items: [] }).found).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(() => parseAnalysis('nope')).toThrow();
  });
});

describe('request', () => {
  const p = defaultProfile('PH');
  it('sends the image first with a cache breakpoint, then the text', () => {
    const r = buildRequest({ image: { data: 'AAAA', mediaType: 'image/jpeg' }, profile: p });
    const content = r.messages[0]!.content;
    expect(content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' }, cache_control: { type: 'ephemeral' } });
    expect(content[1]).toMatchObject({ type: 'text' });
  });
  it('uses the configured model, effort, structured output and refusal fallback', () => {
    const r = buildRequest({ text: 'adobo', profile: p });
    expect(r.model).toBe(MODEL);
    expect(r.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
    expect(r.output_config).toEqual({ effort: EFFORT, format: { type: 'json_schema', schema: SCHEMA } });
    expect(r.betas).toEqual([FALLBACK_BETA]);
    expect(r.fallbacks).toBe('default');
    expect(r.system[0]!.text).toBe(SYSTEM);
    expect(r).not.toHaveProperty('temperature');
  });
  it('puts the profile, description and answers in the user text', () => {
    const t = userText({ ...p, goal: 'sugar', diet: 'halal', avoid: 'peanuts' }, { text: 'Two pandesal and coffee', answers: [{ question: 'Sugar in the coffee?', answer: 'Two teaspoons' }], hasImage: false });
    expect(t).toContain('the Philippines');
    expect(t).toContain('cut sugar');
    expect(t).toContain('halal');
    expect(t).toContain('peanuts');
    expect(t).toContain('Two pandesal and coffee');
    expect(t).toContain('- Sugar in the coffee? Two teaspoons');
  });
});

type Step = { ev?: unknown; text?: [string, string] };

function fakeClient(steps: Step[], final: Partial<Anthropic.Beta.BetaMessage> | Error) {
  const sent: unknown[] = [];
  const client = {
    beta: {
      messages: {
        stream(params: unknown) {
          sent.push(params);
          const handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
          const s = {
            on(name: string, cb: (...a: unknown[]) => void) { (handlers[name] ??= []).push(cb); return s; },
            async finalMessage() {
              for (const st of steps) {
                if (st.ev) handlers.streamEvent?.forEach(cb => cb(st.ev));
                if (st.text) handlers.text?.forEach(cb => cb(...st.text!));
              }
              if (final instanceof Error) throw final;
              return final;
            },
          };
          return s;
        },
      },
    },
  };
  return { client: client as unknown as Pick<Anthropic, 'beta'>, sent };
}

const usage = { input_tokens: 1500, output_tokens: 2400, cache_read_input_tokens: 0, cache_creation_input_tokens: 1200 };

describe('analyze', () => {
  const p = defaultProfile('AU');
  const json = JSON.stringify(valid);

  it('reports stages in stream order and returns the parsed result with usage', async () => {
    const stages: Stage[] = [];
    const { client } = fakeClient(
      [
        { ev: { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } } },
        { text: ['{"found":true', '{"found":true'] },
        { text: [json.slice(13), json] },
      ],
      { stop_reason: 'end_turn', content: [{ type: 'text', text: json, citations: null }] as Anthropic.Beta.BetaContentBlock[], usage: usage as Anthropic.Beta.BetaUsage },
    );
    const r = await analyze({ text: 'fried rice', profile: p }, 'k', { client, onStage: s => stages.push(s) });
    expect(stages).toEqual(['send', 'think', 'items', 'swaps']);
    expect(r.analysis.items).toHaveLength(2);
    expect(r.usage).toEqual({ input: 1500, output: 2400, cacheRead: 0, cacheWrite: 1200 });
  });

  it.each([
    ['refusal', 'refusal'],
    ['max_tokens', 'truncated'],
  ] as const)('maps stop reason %s to %s', async (stop, kind) => {
    const { client } = fakeClient([], { stop_reason: stop, content: [], usage: usage as Anthropic.Beta.BetaUsage });
    await expect(analyze({ text: 'x', profile: p }, 'k', { client })).rejects.toMatchObject({ kind });
  });

  it('maps unreadable output to invalid', async () => {
    const { client } = fakeClient([], { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"items": [', citations: null }] as Anthropic.Beta.BetaContentBlock[], usage: usage as Anthropic.Beta.BetaUsage });
    await expect(analyze({ text: 'x', profile: p }, 'k', { client })).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('maps SDK errors to kinds', async () => {
    const auth = new Anthropic.AuthenticationError(401, { type: 'error', error: { type: 'authentication_error', message: 'bad key' } }, 'bad key', new Headers());
    const { client } = fakeClient([], auth);
    const e = await analyze({ text: 'x', profile: p }, 'k', { client }).catch(x => x);
    expect(e).toBeInstanceOf(AnalysisError);
    expect(e.kind).toBe('auth');
  });

  it('reports a cancelled request as aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const { client } = fakeClient([], new Anthropic.APIUserAbortError());
    await expect(analyze({ text: 'x', profile: p }, 'k', { client, signal: ctrl.signal })).rejects.toMatchObject({ kind: 'aborted' });
  });
});

// Red team (failure paths) on dcfa404: a stream that goes quiet, and dropped connections.
import { vi } from 'vitest';
import { FIRST_EVENT_MS } from '@/ai/analyze';

describe('stalls and drops', () => {
  const p = defaultProfile('AU');

  it('ends a silent stream as a connection failure', async () => {
    vi.useFakeTimers();
    try {
      const client = { beta: { messages: { stream(_p: unknown, o: { signal: AbortSignal }) {
        const s = { on() { return s; }, finalMessage: () => new Promise((_r, rej) => o.signal.addEventListener('abort', () => rej(new Anthropic.APIUserAbortError()))) };
        return s;
      } } } } as unknown as Pick<Anthropic, 'beta'>;
      const run = analyze({ text: 'x', profile: p }, 'k', { client }).catch(e => e);
      await vi.advanceTimersByTimeAsync(FIRST_EVENT_MS + 10);
      const e = await run;
      expect(e).toBeInstanceOf(AnalysisError);
      expect(e.kind).toBe('network');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a fetch-level failure as a connection problem', async () => {
    const { client } = fakeClient([], new TypeError('network error'));
    await expect(analyze({ text: 'x', profile: p }, 'k', { client })).rejects.toMatchObject({ kind: 'network' });
  });
});
