import './result.css';
import type { JSX } from 'preact';
import type { EnergyUnit, Item, Nutrients, Source } from '@/core/models';
import { fmt, fmtEnergy, fmtNutrient, roundEnergy, roundNutrient } from '@/core/units';
import { scale } from '@/nutrition/math';
import { MacroBar } from '@/ui/charts';
import { CountUp } from '@/ui/primitives';
import { Chevron, Database, Estimate, Label } from '@/ui/icons';
import { tap } from '@/ui/haptics';

export function EnergyDisplay({ n, low, high, unit }: { n: Nutrients; low?: Nutrients; high?: Nutrients; unit: EnergyUnit }) {
  const showRange = low && high && roundEnergy(high.kcal, unit) - roundEnergy(low.kcal, unit) >= (unit === 'kJ' ? 20 : 5);
  return (
    <div class="energy">
      <div class="display"><CountUp value={n.kcal} format={v => fmt(roundEnergy(v, unit))} /><span class="unit">{unit}</span></div>
      {showRange && <div class="mono energy-range num">Range {fmt(roundEnergy(low!.kcal, unit))}–{fmtEnergy(high!.kcal, unit)}</div>}
    </div>
  );
}

const MINOR = ['satFat', 'fibre', 'sugars', 'sodium'] as const;
const MINOR_LABEL: Record<(typeof MINOR)[number], string> = { satFat: 'Saturated fat', fibre: 'Fibre', sugars: 'Sugars', sodium: 'Sodium' };

export function Breakdown({ n, unit, low, high }: { n: Nutrients; unit: EnergyUnit; low?: Nutrients; high?: Nutrients }) {
  return (
    <div class="breakdown">
      <EnergyDisplay n={n} low={low} high={high} unit={unit} />
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

const SOURCE: Record<Source, { label: string; icon: (p: JSX.SVGAttributes<SVGSVGElement>) => JSX.Element }> = {
  label: { label: 'Label', icon: Label },
  usda: { label: 'USDA', icon: Database },
  estimate: { label: 'Estimate', icon: Estimate },
};

export function SourceChip({ source }: { source: Source }) {
  const s = SOURCE[source];
  const Icon = s.icon;
  return <span class={`chip mono src-${source}`}><Icon />{s.label}</span>;
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
              <span class="meta item-meta"><SourceChip source={it.source} /><span class="num">{fmt(roundNutrient('protein', it.grams))} g</span>{it.detail ? <span class="item-detail"> · {it.detail}</span> : null}</span>
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
