import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { EnergyUnit, Item } from '@/core/models';
import { fmt, fmtNutrient, LABEL } from '@/core/units';
import { scale } from '@/nutrition/math';
import { Sheet } from '@/ui/Sheet';
import { Button } from '@/ui/primitives';
import { Minus, Plus, Trash } from '@/ui/icons';
import { tap } from '@/ui/haptics';

const KEYS = ['kcal', 'protein', 'carbs', 'fat', 'satFat', 'fibre', 'sugars', 'sodium'] as const;

export function ItemSheet({ item, unit, onSave, onRemove, onClose }: { item: Item; unit: EnergyUnit; onSave: (grams: number) => void; onRemove: () => void; onClose: () => void }) {
  const [grams, setGrams] = useState(item.grams);
  // Removal waits for the exit animation, so the sheet never loses its item mid-slide.
  const removing = useRef(false);
  const max = Math.max(item.gramsHigh * 2, item.grams * 2, 50);
  const n = scale(item.per100, grams);
  const step = grams >= 200 ? 10 : 5;
  const set = (g: number) => setGrams(Math.min(max, Math.max(1, Math.round(g))));
  return (
    <Sheet title={item.name} onClose={() => { if (removing.current) onRemove(); onClose(); }}>
      {close => <div class="item-sheet">
        <div class="weight">
          <button class="icon-btn" aria-label="Less" onClick={() => { tap(); set(grams - step); }}><Minus /></button>
          <div class="weight-val"><span class="num">{fmt(grams)}</span><span class="unit">g</span></div>
          <button class="icon-btn" aria-label="More" onClick={() => { tap(); set(grams + step); }}><Plus /></button>
        </div>
        <input
          class="slider"
          type="range"
          min={1}
          max={max}
          step={1}
          value={grams}
          aria-label="Weight in grams"
          data-no-drag
          style={{ '--p': `${((grams - 1) / (max - 1)) * 100}%`, '--lo': `${((item.gramsLow - 1) / (max - 1)) * 100}%`, '--hi': `${((item.gramsHigh - 1) / (max - 1)) * 100}%` } as JSX.CSSProperties}
          onInput={e => set(Number((e.target as HTMLInputElement).value))}
        />
        <div class="slider-foot mono"><button class="link" onClick={() => { tap(); set(item.grams); }}>Reset</button></div>
        <div class="grid2 item-grid">
          {KEYS.map(k => (
            <div key={k}><span class="k">{LABEL[k]}</span><span class="v num">{fmtNutrient(k, n[k], unit)}</span></div>
          ))}
        </div>
        <div class="row item-actions">
          <Button variant="ghost" onClick={() => { removing.current = true; close(); }}><Trash />Remove</Button>
          <Button variant="primary" class="grow" onClick={() => { onSave(grams); close(); }}>Save</Button>
        </div>
      </div>}
    </Sheet>
  );
}
