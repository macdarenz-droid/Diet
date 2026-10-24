// Offline food tables (USDA FoodData Central, FSANZ AFCD, UK CoFID) and a search over them that
// returns the same Candidate shape as the USDA client, so ground.ts can choose among them.
// Sources, licences, normalisation and the file schema: docs/FOOD-DATA.md.
import { NUTRIENT_KEYS, type NutrientKey, type Nutrients } from '@/core/models';
import type { Candidate } from './fdc';

// Written by scripts/foods/build.mjs. The names carry a content hash, so a rebuilt table is never
// served from an old cache. Paths are relative to the app's base URL.
export const FOOD_FILES = ['data/foods-usda.b991c20367.json', 'data/foods-afcd.62e028cc86.json', 'data/foods-cofid.657e1056d3.json'] as const;

export type SourceKey = 'usda' | 'afcd' | 'cofid';

/** id, name, kcal, protein, carbs, fat, satFat, fibre, sugars, sodium[, alcohol[, aliases]]. */
export type FoodRow = [
  id: string | number, name: string, kcal: number, protein: number, carbs: number, fat: number,
  satFat: number | null, fibre: number | null, sugars: number | null, sodium: number | null,
  alcohol?: number | null, aliases?: string[] | null,
];

export interface FoodTable {
  schema: 1;
  source: SourceKey;
  title: string;
  publisher: string;
  licence: string;
  licenceUrl: string;
  attribution: string;
  notices: string[];
  fields: string[];
  groups: { dataType: string; foods: FoodRow[] }[];
}

export const FIELDS = ['id', 'name', 'kcal', 'protein', 'carbs', 'fat', 'satFat', 'fibre', 'sugars', 'sodium', 'alcohol', 'aliases'];

export interface LocalCandidate extends Candidate {
  source: SourceKey;
  /** The source's own id (USDA FDC id, AFCD public food key, CoFID food code). */
  sourceId: string;
  /** Nutrients the source does not report. per100 holds 0 for them; see withEstimate. */
  missing: NutrientKey[];
  /** The source's alternative name that matched the query, when the match came through one. */
  alias?: string;
  score: number;
}

// ---------------------------------------------------------------------------------------------
// Words. Plurals are folded the same way as ground.ts tokens(), so a name that matches here also
// overlaps there; descriptive words such as "raw" and "cooked" are kept for ranking.

const STOP = new Set(['and', 'with', 'or', 'in', 'of', 'the', 'a', 'an', 'to', 'for', 'as', 'nfs', 'ns']);
/** Words that name the usual form of a food; a name is not ranked lower for carrying them. */
const NEUTRAL = new Set(['raw', 'fresh', 'plain', 'average', 'regular', 'commercial']);
const letter = (c: string | undefined) => c !== undefined && c >= 'a' && c <= 'z';
/** The same folding as ground.ts: "-ies" to "-y", then a final "s" after three letters dropped. */
function singular(t: string): string {
  if (t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  const n = t.length;
  return n >= 4 && t[n - 1] === 's' && letter(t[n - 2]) && letter(t[n - 3]) && letter(t[n - 4]) ? t.slice(0, -1) : t;
}

function plain(s: string): string {
  const t = /[^\x00-\x7f]/.test(s) ? s.normalize('NFKD').replace(/\p{M}+/gu, '') : s;
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

interface Joined { key: string; from: number; to: number }

interface Phrase {
  /** The text shown when this phrase is an alias. */
  text: string;
  raw: string[];
  /** Position in raw of each search word. */
  at: number[];
  words: string[];
  joinedCache?: Joined[];
}

/** A text's search words: lower case, accents and punctuation removed, plurals folded, filler
 * words ("and", "with", "NFS") dropped. */
function phrase(text: string): Phrase {
  const raw = plain(text).split(' ').filter(Boolean);
  const at: number[] = [];
  raw.forEach((t, i) => { if (t.length > 1 && !STOP.has(t)) at.push(i); });
  return { text: text.trim(), raw, at, words: at.map(i => singular(raw[i]!)) };
}

/** Two or three adjacent words written together ("pan de sal" as "pandesal"), with the span of
 * search words they stand for. */
function joined(p: Phrase): Joined[] {
  if (p.joinedCache) return p.joinedCache;
  const out: Joined[] = [];
  for (let i = 0; i < p.raw.length; i++) {
    for (let n = 2; n <= 3 && i + n <= p.raw.length; n++) {
      const from = p.at.findIndex(k => k >= i);
      let to = -1;
      p.at.forEach((k, j) => { if (k < i + n) to = j; });
      if (from >= 0 && to > from) out.push({ key: singular(p.raw.slice(i, i + n).join('')), from, to });
    }
  }
  return (p.joinedCache = out);
}

/** An alias split into the names it lists ("Pan de sal / Pandisal Filipino bread"). A food's own
 * name stays one phrase, so a bracketed part such as a brand never stands alone. */
const phrases = (text: string) => text.split(/[/;()]/).map(s => s.trim()).filter(Boolean).map(phrase);

// ---------------------------------------------------------------------------------------------
// Index.

interface Food {
  source: SourceKey;
  dataType: string;
  id: string | number;
  name: string;
  per100: Nutrients;
  missing: NutrientKey[];
  names: Phrase[];
  aliases: Phrase[];
}

const VALUE_AT: Record<NutrientKey, number> = { kcal: 2, protein: 3, carbs: 4, fat: 5, satFat: 6, fibre: 7, sugars: 8, sodium: 9 };

/** Ranking weights on top of query coverage (0..1). A match through an alias counts for half:
 * FNDDS "additional descriptions" list flavours and variants as well as other names. */
export const WEIGHT = { fit: 0.3, first: 0.15, exact: 0.3, order: 0.1, alias: 0.5 } as const;

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

/** Candidate.fdcId: the FDC id for USDA foods; for the others a stable number from 1e9 up, which
 * no FDC id reaches (the largest is under 1e7). */
export function numericId(source: SourceKey, id: string | number): number {
  if (source === 'usda') return Number(id);
  return 1_000_000_000 + (fnv1a(`${source}:${id}`) % 1_000_000_000);
}

export function checkTable(t: unknown): FoodTable {
  const x = t as Partial<FoodTable> | null;
  if (!x || x.schema !== 1 || !Array.isArray(x.groups) || JSON.stringify(x.fields) !== JSON.stringify(FIELDS)) throw new Error('food table has an unknown shape');
  if (x.source !== 'usda' && x.source !== 'afcd' && x.source !== 'cofid') throw new Error('food table has an unknown source');
  return x as FoodTable;
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);

function post(m: Map<string, number[]>, key: string, i: number): void {
  const list = m.get(key);
  if (!list) m.set(key, [i]); else if (list[list.length - 1] !== i) list.push(i);
}

export class FoodIndex {
  readonly foods: Food[] = [];
  private readonly postings = new Map<string, number[]>();
  private readonly sorted: string[];
  private joinedPostings: Map<string, number[]> | null = null;

  constructor(tables: readonly FoodTable[]) {
    for (const t of tables) {
      for (const g of t.groups) {
        for (const r of g.foods) {
          const per100 = {} as Nutrients;
          const missing: NutrientKey[] = [];
          for (const k of NUTRIENT_KEYS) {
            const v = r[VALUE_AT[k]];
            if (typeof v === 'number') per100[k] = v; else { per100[k] = 0; missing.push(k); }
          }
          const f: Food = { source: t.source, dataType: g.dataType, id: r[0], name: r[1], per100, missing, names: [phrase(r[1])], aliases: (r[11] ?? []).flatMap(phrases) };
          const i = this.foods.push(f) - 1;
          for (const p of f.names) for (const w of p.words) post(this.postings, w, i);
          for (const p of f.aliases) for (const w of p.words) post(this.postings, w, i);
        }
      }
    }
    this.sorted = [...this.postings.keys()].sort();
  }

  /** Joined forms of every name and alias, built the first time a query word is in none of them. */
  private joinedIndex(): Map<string, number[]> {
    if (this.joinedPostings) return this.joinedPostings;
    const m = new Map<string, number[]>();
    this.foods.forEach((f, i) => {
      for (const p of f.names) for (const j of joined(p)) post(m, j.key, i);
      for (const p of f.aliases) for (const j of joined(p)) post(m, j.key, i);
    });
    return (this.joinedPostings = m);
  }

  private df(key: string): number {
    return this.postings.get(key)?.length ?? this.joinedPostings?.get(key)?.length ?? 0;
  }

  /** Index words starting with a prefix, for words typed in part ("spaghet"). */
  private prefixed(prefix: string, max = 40): string[] {
    let lo = 0, hi = this.sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.sorted[mid]! < prefix) lo = mid + 1; else hi = mid; }
    const out: string[] = [];
    for (let i = lo; i < this.sorted.length && out.length < max && this.sorted[i]!.startsWith(prefix); i++) out.push(this.sorted[i]!);
    return out;
  }

  search(query: string, limit = 10): LocalCandidate[] {
    const q = phrase(query);
    const n = q.words.length;
    if (!n) return [];
    // Each query word may be found as itself, as a name's words written together ("pandesal"),
    // inside a joined form the query writes apart ("pan de sal"), or, when it is the last word
    // and in no name at all, as the start of a longer word (typed in part).
    const terms: { list: number[]; covers: number[]; credit: number }[] = [];
    const qset = new Set(q.words);
    const glue = new Set<string>();
    q.words.forEach((w, i) => {
      const exact = this.postings.get(w);
      if (exact) { terms.push({ list: exact, covers: [i], credit: 1 }); return; }
      const glued = this.joinedIndex().get(w);
      if (glued) { terms.push({ list: glued, covers: [i], credit: 1 }); glue.add(w); return; }
      if (i === n - 1 && w.length >= 4) for (const k of this.prefixed(w)) { terms.push({ list: this.postings.get(k)!, covers: [i], credit: 0.6 }); qset.add(k); }
    });
    const qJoined = joined(q).filter(j => this.postings.has(j.key));
    for (const j of qJoined) { terms.push({ list: this.postings.get(j.key)!, covers: range(j.from, j.to), credit: 1 }); qset.add(j.key); }
    /** How many query words one name or alias holds (as words, or written together or apart). */
    const held = (p: Phrase) => {
      const pw = new Set(p.words);
      const keys = glue.size ? new Set(joined(p).map(j => j.key)) : undefined;
      return q.words.filter((w, i) => pw.has(w) || keys?.has(w) || qJoined.some(j => j.from <= i && i <= j.to && pw.has(j.key))).length;
    };
    const N = this.foods.length;
    const weight = q.words.map(w => Math.log(1 + N / (this.df(w) + 1)));
    const total = weight.reduce((a, b) => a + b, 0);

    const hits = new Map<number, number[]>();
    for (const t of terms) {
      for (const i of t.list) {
        let cover = hits.get(i);
        if (!cover) { cover = new Array<number>(n).fill(0); hits.set(i, cover); }
        for (const c of t.covers) cover[c] = Math.max(cover[c]!, t.credit);
      }
    }

    const scored: { i: number; score: number; alias?: string }[] = [];
    for (const [i, cover] of hits) {
      const f = this.foods[i]!;
      const coverage = cover.reduce((s, c, k) => s + c * weight[k]!, 0) / total;
      // How well the query fits the best of the food's names and aliases.
      let fit = 0;
      let alias: string | undefined;
      const consider = (p: Phrase, isAlias: boolean) => {
        const counted = p.words.map((w, k) => ({ w, k })).filter(x => !NEUTRAL.has(x.w) || qset.has(x.w));
        if (!counted.length) return;
        const covered = new Set(counted.filter(x => qset.has(x.w)).map(x => x.k));
        if (covered.size < counted.length) for (const j of joined(p)) if (qset.has(j.key)) for (let k = j.from; k <= j.to; k++) covered.add(k);
        const share = counted.filter(x => covered.has(x.k)).length / counted.length;
        const exact = share === 1 && held(p) === n ? 1 : 0;
        const first = covered.has(counted[0]!.k) ? 1 : 0;
        // Query words that follow each other also follow each other here ("flat white").
        let adjacent = 0;
        for (let k = 0; k + 1 < n; k++) { const a = p.words.indexOf(q.words[k]!); if (a >= 0 && p.words[a + 1] === q.words[k + 1]) adjacent++; }
        const order = n > 1 ? adjacent / (n - 1) : 0;
        const value = (WEIGHT.fit * share + WEIGHT.first * first + WEIGHT.exact * exact + WEIGHT.order * order) * (isAlias ? WEIGHT.alias : 1);
        if (value > fit) { fit = value; alias = isAlias ? p.text : undefined; }
      };
      for (const p of f.names) consider(p, false);
      for (const p of f.aliases) consider(p, true);
      scored.push({ i, score: coverage + fit, alias });
    }
    scored.sort((a, b) => b.score - a.score || this.foods[a.i]!.name.length - this.foods[b.i]!.name.length || a.i - b.i);

    return scored.slice(0, Math.max(1, Math.min(50, Math.floor(limit)))).map((s, rank) => {
      const f = this.foods[s.i]!;
      return {
        fdcId: numericId(f.source, f.id),
        description: s.alias ? `${f.name} (${s.alias})` : f.name,
        dataType: f.dataType,
        per100: { ...f.per100 },
        rank,
        source: f.source,
        sourceId: String(f.id),
        missing: [...f.missing],
        ...(s.alias ? { alias: s.alias } : {}),
        score: s.score,
      };
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Loading: fetched on first use, same origin, kept in memory for the session.

export type Loader = (path: string) => Promise<unknown>;

const fetchJson: Loader = async path => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`food table ${path}: status ${res.status}`);
  return res.json();
};

let pending: Promise<FoodIndex> | null = null;

export function loadFoods(load: Loader = fetchJson): Promise<FoodIndex> {
  pending ??= Promise.all(FOOD_FILES.map(f => load(f)))
    .then(tables => new FoodIndex(tables.map(checkTable)))
    .catch(e => { pending = null; throw e; });
  return pending;
}

/** Forgets the loaded tables (tests). */
export function resetFoods(): void { pending = null; }

/** Foods matching a generic food name, best first, from the offline tables. */
export async function searchLocal(query: string, limit = 10): Promise<LocalCandidate[]> {
  return (await loadFoods()).search(query, limit);
}

/** A candidate's per-100 g values with the nutrients its source does not report taken from
 * Claude's estimate, so a missing value never reads as 0. */
export function withEstimate(c: Pick<LocalCandidate, 'per100' | 'missing'>, estimate: Nutrients): Nutrients {
  const out = { ...c.per100 };
  for (const k of c.missing) out[k] = estimate[k];
  return out;
}
