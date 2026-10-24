import './profile.css';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { Diet, Goal, Profile as P, Targets } from '@/core/models';
import { costUsd, keys, prefs, profile, usage } from '@/core/store';
import { monthKey } from '@/core/dates';
import { fmt, fromEnergy, roundEnergy } from '@/core/units';
import { clearMeals } from '@/core/db';
import { PRICE } from '@/ai/config';
import { Button, Choices, Section, Segmented, Switch } from '@/ui/primitives';
import { Chevron, Key, Trash } from '@/ui/icons';
import { osReducedMotion } from '@/ui/motion';
import { tap } from '@/ui/haptics';
import { Sheet } from '@/ui/Sheet';
import { toast } from '@/app/toast';
import { meals } from '@/slices/today/meals';
import { KeySheet, keySheet, maskKey } from './KeySheet';

const GOALS: { value: Goal; label: string }[] = [
  { value: 'lose', label: 'Lose fat' },
  { value: 'maintain', label: 'Eat better' },
  { value: 'muscle', label: 'Build muscle' },
  { value: 'sugar', label: 'Less sugar' },
  { value: 'heart', label: 'Heart health' },
];

const DIETS: { value: Diet; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'halal', label: 'Halal' },
];

const set = (p: Partial<P>) => { profile.value = { ...profile.value, ...p }; };
const setTarget = (k: keyof Targets, v: number) => { profile.value = { ...profile.value, targets: { ...profile.value.targets, [k]: v } }; };

function TargetRow({ label, value, unit, onChange, offWhenZero }: { label: string; value: number; unit: string; onChange: (v: number) => void; offWhenZero?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (offWhenZero && value === 0 ? '' : String(Math.round(value)));
  return (
    <label class="li target">
      <span class="title grow">{label}</span>
      <span class="input-wrap target-input">
        <input
          class="input num"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder={offWhenZero ? 'Off' : ''}
          value={shown}
          onInput={e => setDraft((e.target as HTMLInputElement).value.replace(/[^0-9]/g, ''))}
          onBlur={() => { if (draft !== null) { const n = Number(draft || 0); if (offWhenZero || n > 0) onChange(n); setDraft(null); } }}
          aria-label={label}
        />
        <span class="suffix">{unit}</span>
      </span>
    </label>
  );
}

function ClearSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Clear food log" onClose={onClose}>
      {close => (
        <div class="stack">
          <p class="muted clear-copy">Deletes every logged meal on this device.</p>
          <Button variant="danger" block onClick={async () => { await clearMeals(); meals.value = []; close(); toast('Food log cleared'); }}><Trash />Delete all meals</Button>
        </div>
      )}
    </Sheet>
  );
}

export function Profile() {
  const p = profile.value;
  const k = keys.value;
  const month = usage.value.find(m => m.month === monthKey(Date.now()));
  const [clearing, setClearing] = useState(false);
  const osReduce = osReducedMotion();

  return (
    <div class="screen profile">
      <header class="screen-head rise"><div><div class="mono">Settings</div><h1>Profile</h1></div></header>

      <Section title="Goal" i={1}>
        <Choices label="Goal" value={p.goal} options={GOALS} onChange={goal => set({ goal })} />
      </Section>

      <Section title="Diet" i={2}>
        <Choices label="Diet" value={p.diet} options={DIETS} onChange={diet => set({ diet })} />
      </Section>

      <Section title="Avoid" i={3}>
        <input class="input" placeholder="Peanuts, shellfish, coriander" value={p.avoid} onChange={e => set({ avoid: (e.target as HTMLInputElement).value })} aria-label="Foods to avoid" />
      </Section>

      <Section title="Region" i={4}>
        <Segmented label="Region" value={p.region} options={[{ value: 'AU', label: 'Australia' }, { value: 'PH', label: 'Philippines' }]} onChange={region => set({ region })} />
      </Section>

      <Section title="Energy unit" i={5}>
        <Segmented label="Energy unit" value={p.unit} options={[{ value: 'kJ', label: 'Kilojoules' }, { value: 'kcal', label: 'Calories' }]} onChange={unit => set({ unit })} />
      </Section>

      <Section title="Targets" i={6}>
        <div class="list">
          <TargetRow label="Energy" value={roundEnergy(p.targets.energy, p.unit)} unit={p.unit} onChange={v => setTarget('energy', fromEnergy(v, p.unit))} />
          <TargetRow label="Protein" value={p.targets.protein} unit="g" offWhenZero onChange={v => setTarget('protein', v)} />
          <TargetRow label="Fibre" value={p.targets.fibre} unit="g" onChange={v => setTarget('fibre', v)} />
          <TargetRow label="Sugars" value={p.targets.sugars} unit="g" onChange={v => setTarget('sugars', v)} />
          <TargetRow label="Sodium" value={p.targets.sodium} unit="mg" onChange={v => setTarget('sodium', v)} />
        </div>
      </Section>

      <Section title="Keys" i={7}>
        <div class="list">
          <button class="li" onClick={() => { tap(); keySheet.value = 'claude'; }}>
            <span class="key-icon"><Key /></span>
            <span class="grow"><span class="title">Claude</span><span class="meta">{k.claude ? maskKey(k.claude) : 'Not added'}</span></span>
            <span class="end">{k.claude && <span class="chip mono"><span class="dot ok" />Added</span>}<Chevron class="chev" /></span>
          </button>
          <button class="li" onClick={() => { tap(); keySheet.value = 'usda'; }}>
            <span class="key-icon"><Key /></span>
            <span class="grow"><span class="title">USDA FoodData Central</span><span class="meta">{k.usda ? maskKey(k.usda) : 'Not added'}</span></span>
            <span class="end">{k.usda && <span class="chip mono"><span class="dot ok" />Added</span>}<Chevron class="chev" /></span>
          </button>
        </div>
      </Section>

      <Section title="Usage" i={8} end={<span class="mono">This month</span>}>
        <div class="grid2 usage">
          <div><span class="k">Scans</span><span class="v num">{fmt(month?.scans ?? 0)}</span></div>
          <div><span class="k">Estimated cost</span><span class="v num">US${(month ? costUsd(month, PRICE) : 0).toFixed(2)}</span></div>
          <div><span class="k">Input tokens</span><span class="v num">{fmt(month ? month.input + month.cacheRead + month.cacheWrite : 0)}</span></div>
          <div><span class="k">Output tokens</span><span class="v num">{fmt(month?.output ?? 0)}</span></div>
        </div>
      </Section>

      <Section title="Display" i={9}>
        <div class="stack">
          <Segmented label="Theme" value={prefs.value.theme} options={[{ value: 'night', label: 'Night' }, { value: 'day', label: 'Day' }]} onChange={theme => { prefs.value = { ...prefs.value, theme }; }} />
          <div class="list">
            <div class="li">
              <span class="title grow">Reduce motion</span>
              <Switch label="Reduce motion" checked={osReduce || prefs.value.reduceMotion} disabled={osReduce} onChange={v => { prefs.value = { ...prefs.value, reduceMotion: v }; }} />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Data" i={10}>
        <Button variant="secondary" block onClick={() => setClearing(true)}><Trash />Clear food log</Button>
      </Section>

      <p class="mono version" style={{ '--i': 11 } as JSX.CSSProperties}>Nuance {__APP_VERSION__}</p>

      {keySheet.value && <KeySheet which={keySheet.value} onClose={() => { keySheet.value = null; }} />}
      {clearing && <ClearSheet onClose={() => setClearing(false)} />}
    </div>
  );
}
