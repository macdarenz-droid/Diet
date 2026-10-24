// Swap carousel: horizontal scroll-snap; the centred card is full size and its neighbours recede.
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { EnergyUnit, Goal, Keep, Nutrients, Swap, SwapKind } from '@/core/models';
import { fmtEnergy } from '@/core/units';
import { deltaKeys, isBetter, sub, totals } from '@/nutrition/math';
import { Delta } from '@/ui/charts';
import { useSpotlight } from '@/ui/primitives';
import { Check, Swap as SwapIcon } from '@/ui/icons';
import { tap } from '@/ui/haptics';
import { reduced } from '@/ui/motion';

const KIND: Record<SwapKind, string> = { ingredient: 'Ingredient', method: 'Method', dish: 'Dish', product: 'Product', portion: 'Portion' };
const KEEP: Record<Keep, string> = { taste: 'Taste', texture: 'Texture', ingredient: 'Ingredient', occasion: 'Occasion' };
const MATCH = { close: 'Close match', similar: 'Similar', loose: 'Different' } as const;
const EFFORT = { none: 'No prep', low: 'Little prep', medium: 'Some prep' } as const;

function SwapCard({ sw, original, goal, unit, selected, onSelect, i }: { sw: Swap; original: Nutrients; goal: Goal; unit: EnergyUnit; selected: boolean; onSelect: () => void; i: number }) {
  const ref = useSpotlight<HTMLElement>();
  const t = totals(sw.items);
  const d = sub(t, original);
  return (
    <article ref={ref} class={`swap card spot${selected ? ' selected' : ''}`} style={{ '--i': i } as JSX.CSSProperties} aria-label={sw.title}>
      <div class="swap-top">
        <span class="chip mono">{KIND[sw.kind]}</span>
        <span class={`chip match-${sw.match}`}><span class="dot" />{MATCH[sw.match]}</span>
      </div>
      <h3 class="swap-title">{sw.title}</h3>
      <p class="swap-why">{sw.why}</p>
      <div class="swap-deltas">
        {deltaKeys(goal).map(k => <Delta key={k} k={k} delta={d[k]} better={isBetter(goal, k, d[k])} unit={unit} />)}
      </div>
      <div class="swap-foot">
        <div class="swap-meta">
          <span class="num swap-kj">{fmtEnergy(t.kcal, unit)}</span>
          <span class="faint">{[...sw.keeps.map(k => KEEP[k]), EFFORT[sw.effort]].join(' · ')}</span>
        </div>
        <button class={`btn sm ${selected ? 'primary' : 'secondary'} swap-use`} aria-pressed={selected} onClick={() => { tap(); onSelect(); }}>
          {selected ? <><Check />Chosen</> : <><SwapIcon />Use swap</>}
        </button>
      </div>
    </article>
  );
}

export function Swaps({ swaps, original, goal, unit, selected, onSelect }: { swaps: Swap[]; original: Nutrients; goal: Goal; unit: EnergyUnit; selected: string | null; onSelect: (id: string) => void }) {
  const rail = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      Array.from(el.children).forEach((c, i) => {
        const card = c as HTMLElement;
        const center = card.offsetLeft + card.offsetWidth / 2;
        const dist = Math.abs(center - mid);
        if (dist < bestDist) { bestDist = dist; best = i; }
        if (!reduced()) {
          const k = Math.min(1, dist / card.offsetWidth);
          card.style.setProperty('--k', k.toFixed(3));
        }
      });
      setIndex(best);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [swaps.length]);

  const goTo = (i: number) => {
    const el = rail.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2, behavior: reduced() ? 'auto' : 'smooth' });
  };

  return (
    <div class="swaps">
      <div ref={rail} class="swap-rail" role="list">
        {swaps.map((sw, i) => (
          <div role="listitem" class="swap-slot" key={sw.id}>
            <SwapCard sw={sw} original={original} goal={goal} unit={unit} selected={selected === sw.id} onSelect={() => onSelect(sw.id)} i={i} />
          </div>
        ))}
      </div>
      {swaps.length > 1 && (
        <div class="dots" role="tablist" aria-label="Swaps">
          {swaps.map((sw, i) => <button key={sw.id} role="tab" aria-selected={i === index} aria-label={sw.title} class={i === index ? 'on' : ''} onClick={() => goTo(i)} />)}
        </div>
      )}
    </div>
  );
}
