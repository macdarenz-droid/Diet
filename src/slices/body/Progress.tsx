import './body.css';
import type { JSX } from 'preact';
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { profile } from '@/core/store';
import { fmtShortDay } from '@/core/dates';
import { fmt } from '@/core/units';
import type { TrendPoint } from '@/metabolism';
import { Button, Card, CountUp } from '@/ui/primitives';
import { Arrow, Chevron, Down, Up } from '@/ui/icons';
import { tap } from '@/ui/haptics';
import { go } from '@/app/router';
import { activeTargets, assessment, complete, trend } from './body';
import { word, type Worded } from './words';
import { WeightSheet } from './WeightSheet';

/** At most this many insights on Today, most important first. */
export const INSIGHTS_SHOWN = 3;
const SPAN_DAYS = 56;
const H = 72;
const PAD = 6;

function Sparkline({ points, onScrub }: { points: TrendPoint[]; onScrub: (p: TrendPoint | null) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const [at, setAt] = useState<number | null>(null);
  // Drawn at the element's own pixel width, so dots stay round on any screen.
  const [W, setW] = useState(320);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => { const w = Math.round(el.getBoundingClientRect().width); if (w > 0) setW(w); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const geo = useMemo(() => {
    const t1 = points.at(-1)!.at;
    const t0 = Math.min(points[0]!.at, t1 - 7 * 864e5);
    const kgs = points.flatMap(p => [p.kg, p.trendKg]);
    let lo = Math.min(...kgs), hi = Math.max(...kgs);
    if (hi - lo < 1) { const mid = (hi + lo) / 2; lo = mid - 0.5; hi = mid + 0.5; }
    const x = (t: number) => PAD + (t - t0) / (t1 - t0 || 1) * (W - 2 * PAD);
    const y = (kg: number) => PAD + (hi - kg) / (hi - lo) * (H - 2 * PAD);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.trendKg).toFixed(1)}`).join('');
    return { x, y, line };
  }, [points, W]);

  const scrub = (e: PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * W;
    let best = 0;
    points.forEach((p, i) => { if (Math.abs(geo.x(p.at) - px) < Math.abs(geo.x(points[best]!.at) - px)) best = i; });
    if (best !== at) { setAt(best); onScrub(points[best]!); }
  };
  const end = () => { setAt(null); onScrub(null); };
  const last = points.at(-1)!;
  const sel = at !== null ? points[at]! : null;

  return (
    <svg
      ref={ref}
      class="spark"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Trend weight over ${points.length} weigh-ins, now ${fmt(last.trendKg)} kg`}
      onPointerDown={scrub}
      onPointerMove={scrub}
      onPointerLeave={end}
      onPointerUp={e => { if (e.pointerType !== 'mouse') end(); }}
      onPointerCancel={end}
    >
      {points.map(p => <circle key={p.at} class="raw" cx={geo.x(p.at)} cy={geo.y(p.kg)} r="1.8" />)}
      <path class="trend" d={geo.line} />
      {sel && <line class="cross" x1={geo.x(sel.at)} x2={geo.x(sel.at)} y1="0" y2={H} />}
      <circle class="end" cx={geo.x((sel ?? last).at)} cy={geo.y((sel ?? last).trendKg)} r="4" />
    </svg>
  );
}

function WeightCard({ onLog }: { onLog: () => void }) {
  const t = trend.value;
  const [scrub, setScrub] = useState<TrendPoint | null>(null);
  if (!t) {
    return (
      <Card class="weigh-card rise" style={{ '--i': 0 } as JSX.CSSProperties}>
        <div class="spread">
          <div><div class="mono">Weight</div><div class="weight-empty">No weigh-ins</div></div>
          <Button size="sm" onClick={onLog}>Log weight</Button>
        </div>
      </Card>
    );
  }
  const from = t.last.at - SPAN_DAYS * 864e5;
  const points = t.points.filter(p => p.at >= from);
  const change = t.weekChange;
  const shownChange = change !== null && Math.abs(change) >= 0.05 ? change : null;
  return (
    <Card class="weigh-card rise" style={{ '--i': 0 } as JSX.CSSProperties}>
      <div class="spread weight-top">
        <div>
          <div class="mono" aria-live="polite">{scrub ? fmtShortDay(scrub.at) : 'Trend'}</div>
          <div class="weight-kg">
            {scrub ? <span class="num">{fmt(scrub.trendKg)}</span> : <CountUp value={t.kg} format={v => fmt(Math.round(v * 10) / 10)} />}
            <small>kg</small>
          </div>
        </div>
        <Button size="sm" onClick={onLog}>Log weight</Button>
      </div>
      {shownChange !== null && (
        <span class="chip weight-change">
          {shownChange < 0 ? <Down /> : <Up />}
          <span class="num">{shownChange < 0 ? '−' : '+'}{fmt(Math.abs(Math.round(shownChange * 10) / 10))} kg</span>
          <span class="faint">this week</span>
        </span>
      )}
      {points.length >= 2 && <Sparkline points={points} onScrub={setScrub} />}
    </Card>
  );
}

function InsightCard({ w, i }: { w: Worded; i: number }) {
  const [open, setOpen] = useState(false);
  const more = w.also.length > 0;
  return (
    <Card
      class={`insight tone-${w.tone} rise${open ? ' open' : ''}`}
      style={{ '--i': i + 1 } as JSX.CSSProperties}
      onClick={more ? () => setOpen(!open) : undefined}
      aria-expanded={more ? open : undefined}
    >
      <div class="insight-head">
        <span class="insight-dot" aria-hidden="true" />
        <span class="insight-title grow">{w.title}</span>
        {more && <Chevron class="insight-chev" />}
      </div>
      <p class="insight-body">{w.body}</p>
      {w.action && <p class="insight-action"><Arrow />{w.action}</p>}
      {more && (
        <div class="insight-more" aria-hidden={!open}>
          <ul>{w.also.map(a => <li key={a}>{a}</li>)}</ul>
        </div>
      )}
    </Card>
  );
}

export function Progress() {
  const [logging, setLogging] = useState(false);
  const p = profile.value;
  const a = assessment.value;
  const words = a
    ? a.insights.filter(x => x.id !== 'excluded').slice(0, INSIGHTS_SHOWN).map(x => word(x, { unit: p.unit, weightKg: a.weightKg, auto: activeTargets.value.auto }))
    : [];
  const open = () => { tap(); setLogging(true); };
  return (
    <div class="progress">
      <WeightCard onLog={open} />
      {!complete(p.body) && (
        <Card class="body-cta rise" style={{ '--i': 1 } as JSX.CSSProperties} onClick={() => go('profile')}>
          <div class="spread">
            <span class="insight-title">Body details</span>
            <span class="row body-cta-end"><span class="muted">Add</span><Chevron class="chev" /></span>
          </div>
        </Card>
      )}
      {words.map((w, i) => <InsightCard key={w.title} w={w} i={i} />)}
      {logging && <WeightSheet onClose={() => setLogging(false)} />}
    </div>
  );
}
