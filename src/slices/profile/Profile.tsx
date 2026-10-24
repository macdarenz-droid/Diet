import './profile.css';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { Activity, Body, Diet, Goal, Pace, Profile as P, Sex, Targets } from '@/core/models';
import { costUsd, keys, prefs, profile, usage } from '@/core/store';
import { monthKey } from '@/core/dates';
import { energy, fmt, fmtEnergy, fromEnergy } from '@/core/units';
import { clearMeals, eraseAll } from '@/core/db';
import { PRICE } from '@/ai/config';
import { Button, Choices, Section, Segmented, Switch } from '@/ui/primitives';
import { Chevron, Key, Trash } from '@/ui/icons';
import { osReducedMotion } from '@/ui/motion';
import { tap } from '@/ui/haptics';
import { Sheet } from '@/ui/Sheet';
import { toast } from '@/app/toast';
import { meals } from '@/slices/today/meals';
import { PACE, activeTargets, assessment, birthYears, logWeight, weighIns } from '@/slices/body/body';
import { KG_MAX, KG_MIN } from '@/slices/body/WeightSheet';
import { wordPace } from '@/slices/body/words';
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

const ACTIVITY: { value: Activity; label: string }[] = [
  { value: 'sedentary', label: 'Mostly sitting' },
  { value: 'light', label: 'Lightly active' },
  { value: 'moderate', label: 'Active' },
  { value: 'vigorous', label: 'Very active' },
];

const PACES: { value: Pace; label: string }[] = [
  { value: 'gentle', label: 'Gentle' },
  { value: 'steady', label: 'Steady' },
  { value: 'fast', label: 'Fast' },
];

const set = (p: Partial<P>) => { profile.value = { ...profile.value, ...p }; };
const setBody = (b: Partial<Body>) => set({ body: { ...profile.value.body, ...b } });
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

/** A number field for body details: commits on blur when in range, otherwise shows the last good value. */
function NumRow({ label, value, unit, min, max, decimal, optional, onChange }: { label: string; value: number | undefined; unit?: string; min: number; max: number; decimal?: boolean; optional?: boolean; onChange: (v: number | undefined) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? '' : String(value));
  const parse = (s: string) => { const n = Number(s.replace(',', '.')); return s !== '' && Number.isFinite(n) && n >= min && n <= max ? n : null; };
  return (
    <label class="li body-row">
      <span class="title grow">{label}</span>
      <span class="input-wrap">
        <input
          class="input num"
          inputMode={decimal ? 'decimal' : 'numeric'}
          placeholder={optional ? 'Optional' : ''}
          value={shown}
          onInput={e => setDraft((e.target as HTMLInputElement).value.replace(decimal ? /[^0-9.,]/g : /[^0-9]/g, '').slice(0, 5))}
          onBlur={() => {
            if (draft === null) return;
            const n = parse(draft);
            if (n !== null) onChange(decimal ? Math.round(n * 10) / 10 : Math.round(n));
            else if (draft === '' && optional) onChange(undefined);
            setDraft(null);
          }}
          aria-label={label}
          aria-invalid={draft !== null && draft !== '' && parse(draft) === null}
        />
        {unit && <span class="suffix">{unit}</span>}
      </span>
    </label>
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div class="li target">
      <span class="title grow">{label}</span>
      <span class="num value-end">{value}</span>
    </div>
  );
}

function BodySection({ i }: { i: number }) {
  const b = profile.value.body ?? {};
  const last = weighIns.value.at(-1);
  const years = birthYears();
  return (
    <Section title="Body" i={i}>
      <div class="stack">
        <Segmented<Sex> label="Sex" value={b.sex ?? ('' as Sex)} options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} onChange={sex => setBody(sex === 'male' ? { sex, pregnant: false, breastfeeding: false } : { sex })} />
        <div class="list">
          <NumRow label="Birth year" value={b.birthYear} min={years.min} max={years.max} onChange={birthYear => setBody({ birthYear })} />
          <NumRow label="Height" unit="cm" value={b.heightCm} min={100} max={250} onChange={heightCm => setBody({ heightCm })} />
          <NumRow label="Weight" unit="kg" decimal value={last?.kg} min={KG_MIN} max={KG_MAX} onChange={kg => { if (kg !== undefined) void logWeight(kg).then(ok => { if (!ok) toast('Not saved on this device'); }); }} />
          <NumRow label="Body fat" unit="%" optional value={b.bodyFatPct} min={3} max={70} onChange={bodyFatPct => setBody({ bodyFatPct })} />
          {b.sex === 'female' && <>
            <div class="li"><span class="title grow">Pregnant</span><Switch label="Pregnant" checked={!!b.pregnant} onChange={pregnant => setBody({ pregnant })} /></div>
            <div class="li"><span class="title grow">Breastfeeding</span><Switch label="Breastfeeding" checked={!!b.breastfeeding} onChange={breastfeeding => setBody({ breastfeeding })} /></div>
          </>}
        </div>
        <Choices label="Activity" value={b.activity ?? ('' as Activity)} options={ACTIVITY} onChange={activity => setBody({ activity })} />
      </div>
    </Section>
  );
}

function PaceSection({ i }: { i: number }) {
  const p = profile.value;
  if (p.goal !== 'lose' && p.goal !== 'muscle') return null;
  const a = assessment.value;
  const line = wordPace({
    goal: p.goal,
    chosenPct: PACE[p.goal][p.pace],
    plannedPct: activeTargets.value.auto && a ? a.targets.ratePctPerWeek : null,
    excluded: !!a?.exclusion,
    weightKg: a?.weightKg ?? weighIns.value.at(-1)?.kg ?? null,
  });
  return (
    <Section title="Pace" i={i}>
      <Segmented<Pace> label="Pace" value={p.pace} options={PACES} onChange={pace => set({ pace })} />
      {line && <div class="mono pace-rate num">{line}</div>}
    </Section>
  );
}

function TargetsSection({ i }: { i: number }) {
  const p = profile.value;
  const a = assessment.value;
  const t = activeTargets.value;
  const canAuto = !!a && a.targets.kcal !== null;
  const auto = canAuto && p.autoTargets;
  const setAuto = (on: boolean) => {
    // Turning automatic off keeps today's numbers as the starting manual ones.
    profile.value = on ? { ...p, autoTargets: true } : { ...p, autoTargets: false, targets: { ...p.targets, energy: Math.round(t.energy), protein: Math.round(t.protein) } };
  };
  return (
    <Section title="Targets" i={i}>
      <div class="list">
        {canAuto && <div class="li"><span class="title grow">Automatic</span><Switch label="Automatic targets" checked={auto} onChange={setAuto} /></div>}
        {auto ? <ValueRow label="Energy" value={fmtEnergy(t.energy, p.unit)} /> : <TargetRow label="Energy" value={Math.round(energy(p.targets.energy, p.unit))} unit={p.unit} onChange={v => setTarget('energy', fromEnergy(v, p.unit))} />}
        {auto ? <ValueRow label="Protein" value={`${fmt(Math.round(t.protein))} g`} /> : <TargetRow label="Protein" value={p.targets.protein} unit="g" offWhenZero onChange={v => setTarget('protein', v)} />}
        {t.maintenance !== null && <ValueRow label="Maintenance" value={fmtEnergy(t.maintenance, p.unit)} />}
        <TargetRow label="Fibre" value={p.targets.fibre} unit="g" onChange={v => setTarget('fibre', v)} />
        <TargetRow label="Sugars" value={p.targets.sugars} unit="g" onChange={v => setTarget('sugars', v)} />
        <TargetRow label="Sodium" value={p.targets.sodium} unit="mg" onChange={v => setTarget('sodium', v)} />
      </div>
    </Section>
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

/** Attribution the bundled food tables' licences ask for (THIRD_PARTY_NOTICES.md). */
function FoodDataSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Food data" onClose={onClose}>
      <div class="stack food-data">
        <p>Contains data from the <a href="https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd" target="_blank" rel="noopener noreferrer">Australian Food Composition Database, Release 3</a>, Food Standards Australia New Zealand, used under its <a href="https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd/datauserlicenceagreement" target="_blank" rel="noopener noreferrer">data user licence</a>. Nutrients are selected, converted to kcal and rounded. FSANZ does not endorse Nuance.</p>
        <p>Contains public sector information licensed under the <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noopener noreferrer">Open Government Licence v3.0</a>: McCance and Widdowson's Composition of Foods Integrated Dataset 2021, Public Health England.</p>
      </div>
    </Sheet>
  );
}

function EraseSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Erase all data" onClose={onClose}>
      <div class="stack">
        <p class="muted clear-copy">Deletes meals, weights, profile, key and usage from this device, then restarts the app.</p>
        <Button variant="danger" block onClick={() => { void eraseAll(); }}><Trash />Erase everything</Button>
      </div>
    </Sheet>
  );
}

export function Profile() {
  const p = profile.value;
  const k = keys.value;
  const month = usage.value.find(m => m.month === monthKey(Date.now()));
  const [clearing, setClearing] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [sources, setSources] = useState(false);
  const osReduce = osReducedMotion();

  return (
    <div class="screen profile">
      <header class="screen-head rise"><div><div class="mono">Settings</div><h1>Profile</h1></div></header>

      <Section title="Goal" i={1}>
        <Choices label="Goal" value={p.goal} options={GOALS} onChange={goal => set({ goal })} />
      </Section>

      <BodySection i={2} />
      <PaceSection i={3} />
      <TargetsSection i={4} />

      <Section title="Diet" i={5}>
        <Choices label="Diet" value={p.diet} options={DIETS} onChange={diet => set({ diet })} />
      </Section>

      <Section title="Avoid" i={6}>
        <input class="input" placeholder="Peanuts, shellfish, coriander" value={p.avoid} onChange={e => set({ avoid: (e.target as HTMLInputElement).value })} aria-label="Foods to avoid" />
      </Section>

      <Section title="Region" i={7}>
        <Segmented label="Region" value={p.region} options={[{ value: 'AU', label: 'Australia' }, { value: 'PH', label: 'Philippines' }]} onChange={region => set({ region })} />
      </Section>

      <Section title="Energy unit" i={8}>
        <Segmented label="Energy unit" value={p.unit} options={[{ value: 'kJ', label: 'Kilojoules' }, { value: 'kcal', label: 'Calories' }]} onChange={unit => set({ unit })} />
      </Section>

      <Section title="Key" i={9}>
        <div class="list">
          <button class="li" onClick={() => { tap(); keySheet.value = 'claude'; }}>
            <span class="key-icon"><Key /></span>
            <span class="grow"><span class="title">Claude</span><span class="meta">{k.claude ? maskKey(k.claude) : 'Not added'}</span></span>
            <span class="end">{k.claude && <span class="chip mono"><span class="dot ok" />Added</span>}<Chevron class="chev" /></span>
          </button>
        </div>
      </Section>

      <Section title="Usage" i={10} end={<span class="mono">This month</span>}>
        <div class="grid2 usage">
          <div><span class="k">Scans</span><span class="v num">{fmt(month?.scans ?? 0)}</span></div>
          <div><span class="k">Cost</span><span class="v num">US${(month ? costUsd(month, PRICE) : 0).toFixed(2)}</span></div>
          <div><span class="k">Input tokens</span><span class="v num">{fmt(month ? month.input + month.cacheRead + month.cacheWrite : 0)}</span></div>
          <div><span class="k">Output tokens</span><span class="v num">{fmt(month?.output ?? 0)}</span></div>
        </div>
      </Section>

      <Section title="Display" i={11}>
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

      <Section title="Data" i={12}>
        <div class="stack">
          <Button variant="secondary" block onClick={() => setClearing(true)}><Trash />Clear food log</Button>
          <Button variant="ghost" block onClick={() => setErasing(true)}>Erase all data</Button>
          <Button variant="ghost" block onClick={() => setSources(true)}>Food data</Button>
        </div>
      </Section>

      <p class="mono version" style={{ '--i': 13 } as JSX.CSSProperties}>Nuance {__APP_VERSION__}</p>

      {keySheet.value && <KeySheet which={keySheet.value} onClose={() => { keySheet.value = null; }} />}
      {clearing && <ClearSheet onClose={() => setClearing(false)} />}
      {erasing && <EraseSheet onClose={() => setErasing(false)} />}
      {sources && <FoodDataSheet onClose={() => setSources(false)} />}
    </div>
  );
}
