// Nutrition charts. Colours validated with the dataviz palette checker (docs/DESIGN.md); every mark
// carries a visible label and value, and text stays in ink tokens.
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { EnergyUnit, NutrientKey, Nutrients } from '@/core/models';
import { fmt, fmtDelta, fmtNutrient, roundNutrient, LABEL } from '@/core/units';
import { macroSplit } from '@/nutrition/math';
import { CountUp } from './primitives';
import { Down, Up } from './icons';

const MACROS = [
  { key: 'protein', label: 'Protein', color: 'var(--protein)' },
  { key: 'carbs', label: 'Carbs', color: 'var(--carbs)' },
  { key: 'fat', label: 'Fat', color: 'var(--fat)' },
] as const;

export function MacroBar({ n, legend = true }: { n: Nutrients; legend?: boolean }) {
  const split = macroSplit(n);
  const [on, setOn] = useState<string | null>(null);
  const total = split.protein + split.carbs + split.fat;
  return (
    <div>
      <div class={`macrobar${on ? ' focus' : ''}`} role="img" aria-label={MACROS.map(m => `${m.label} ${Math.round(split[m.key] * 100)}% of energy`).join(', ')}>
        {total > 0 && MACROS.map((m, i) => split[m.key] > 0 && (
          <span key={m.key} class={on === m.key ? 'on' : ''} style={{ flexGrow: split[m.key], background: m.color, '--i': i } as JSX.CSSProperties} />
        ))}
      </div>
      {legend && (
        <div class="legend">
          {MACROS.map(m => (
            <button key={m.key} type="button" data-on={on === m.key} onPointerEnter={() => setOn(m.key)} onPointerLeave={() => setOn(null)} onFocus={() => setOn(m.key)} onBlur={() => setOn(null)} onClick={() => setOn(on === m.key ? null : m.key)}>
              <span class="key"><span class="swatch" style={{ background: m.color }} />{m.label}</span>
              <span class="val"><CountUp value={n[m.key]} format={v => fmt(roundNutrient(m.key, v))} /><small>g</small></span>
              <span class="pct">{Math.round(split[m.key] * 100)}%</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Meter({ k, value, target, unit, i = 0 }: { k: NutrientKey; value: number; target: number; unit: EnergyUnit; i?: number }) {
  const ratio = target > 0 ? value / target : 0;
  const over = ratio > 1;
  const width = Math.min(ratio, 1) * 100;
  return (
    <div class={`meter${over ? ' over' : ''}`} style={{ '--i': i } as JSX.CSSProperties}>
      <div class="spread">
        <span class="muted">{LABEL[k]}</span>
        <span><span class="val num">{fmtNutrient(k, value, unit)}</span> <span class="of num">/ {fmtNutrient(k, target, unit)}</span></span>
      </div>
      <div class="track" role="meter" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.round(value)} aria-label={LABEL[k]}>
        <div class="fill" style={{ width: `${over ? 100 : width}%`, '--cap': over ? 1 / ratio : 1 } as JSX.CSSProperties} />
      </div>
    </div>
  );
}

export function Ring({ ratio, children }: { ratio: number; children: JSX.Element | JSX.Element[] }) {
  const r = 58;
  const c = 2 * Math.PI * r;
  const shown = Math.min(Math.max(ratio, 0), 1);
  return (
    <div class="ring">
      <svg viewBox="0 0 132 132" aria-hidden="true">
        <circle class="t" cx="66" cy="66" r={r} stroke-width="8" />
        <circle class={`v${ratio > 1 ? ' over' : ''}`} cx="66" cy="66" r={r} stroke-width="8" stroke-dasharray={c} stroke-dashoffset={c * (1 - shown)} />
      </svg>
      <div class="c">{children}</div>
    </div>
  );
}

/** A swap's change in one nutrient: arrow, signed value and name; colour only reinforces. */
export function Delta({ k, delta, better, unit }: { k: NutrientKey; delta: number; better: boolean | null; unit: EnergyUnit }) {
  const zero = fmtDelta(k, delta, unit).startsWith('0 ');
  const cls = zero || better === null ? '' : better ? ' good' : ' bad';
  return (
    <span class={`chip${cls}`}>
      {!zero && (delta < 0 ? <Down /> : <Up />)}
      <span class="num">{fmtDelta(k, delta, unit)}</span>
      <span class="faint">{k === 'kcal' ? 'energy' : LABEL[k].toLowerCase()}</span>
    </span>
  );
}
