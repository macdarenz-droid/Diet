import './result.css';
import type { JSX } from 'preact';
import type { EnergyUnit, Item, Nutrients } from '@/core/models';
import { fmt, fmtNutrient, roundEnergy, roundNutrient } from '@/core/units';
import { scale } from '@/nutrition/math';
import { MacroBar } from '@/ui/charts';
import { CountUp } from '@/ui/primitives';
import { Chevron } from '@/ui/icons';
import { tap } from '@/ui/haptics';

// Sources and gram ranges stay in the data; the screen shows one clean figure (owner, 2026-10-24:
// approximation is understood, so no estimate, range, source or confidence wording).
export function EnergyDisplay({ n, unit }: { n: Nutrients; unit: EnergyUnit }) {
  return (
    <div class="energy">
      <div class="display"><CountUp value={n.kcal} format={v => fmt(roundEnergy(v, unit))} /><span class="unit">{unit}</span></div>
    </div>
  );
}

const MINOR = ['satFat', 'fibre', 'sugars', 'sodium'] as const;
const MINOR_LABEL: Record<(typeof MINOR)[number], string> = { satFat: 'Saturated fat', fibre: 'Fibre', sugars: 'Sugars', sodium: 'Sodium' };

export function Breakdown({ n, unit }: { n: Nutrients; unit: EnergyUnit }) {
  return (
    <div class="breakdown">
      <EnergyDisplay n={n} unit={unit} />
      <MacroBar n={n} />
      <div class="grid2 minor">
        {MINOR.map(k => (
          <div key={k}>
            <span class="k">{MINOR_LABEL[k]}</span>
            <span class="v num"><CountUp value={n[k]} format={v => fmt(roundNutrient(k, v))} /><small>{k === 'sodium' ? 'mg' : 'g'}</small></span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ItemList({ items, unit, onEdit }: { items: Item[]; unit: EnergyUnit; onEdit?: (index: number) => void }) {
  return (
    <div class="list items">
      {items.map((it, i) => {
        const e = scale(it.per100, it.grams);
        const inner = (
          <>
            <span class="grow">
              <span class="title item-name">{it.name}</span>
              <span class="meta item-meta"><span class="num">{fmt(roundNutrient('protein', it.grams))} g</span>{it.detail ? <span class="item-detail"> · {it.detail}</span> : null}</span>
            </span>
            <span class="end">
              <span class="num item-kj">{fmtNutrient('kcal', e.kcal, unit)}</span>
              {onEdit && <Chevron class="chev" />}
            </span>
          </>
        );
        return onEdit
          ? <button key={`${it.name}-${i}`} class="li rise" style={{ '--i': i } as JSX.CSSProperties} onClick={() => { tap(); onEdit(i); }}>{inner}</button>
          : <div key={`${it.name}-${i}`} class="li">{inner}</div>;
      })}
    </div>
  );
}
