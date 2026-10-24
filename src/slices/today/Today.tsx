import './today.css';
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { profile } from '@/core/store';
import { fmtDay, fmtTime } from '@/core/dates';
import { today } from '@/core/clock';
import { fmt, fmtEnergy, roundEnergy } from '@/core/units';
import type { Meal } from '@/core/models';
import { MacroBar, Meter, Ring } from '@/ui/charts';
import { Button, Card, CountUp, Section } from '@/ui/primitives';
import { Camera, Mark, Pen, Trash } from '@/ui/icons';
import { track, FLING_PX_PER_MS, SWIPE_COMMIT_FRACTION } from '@/ui/gesture';
import { confirm as hapticConfirm, tap } from '@/ui/haptics';
import { dur } from '@/ui/motion';
import { toast } from '@/app/toast';
import { openScan } from '@/app/scan';
import { logMeal, removeMeal, todays, todayTotals, loaded } from './meals';
import { MealSheet } from './MealSheet';
import { activeTargets } from '@/slices/body/body';
import { Progress } from '@/slices/body/Progress';

function Summary() {
  const p = profile.value;
  const t = todayTotals.value;
  const target = activeTargets.value.energy;
  const ratio = target > 0 ? t.kcal / target : 0;
  const left = target - t.kcal;
  return (
    <Card class="summary rise" style={{ '--i': 1 } as JSX.CSSProperties}>
      <div class="summary-top">
        <Ring ratio={ratio}>
          <div class="big"><CountUp value={t.kcal} format={v => fmt(roundEnergy(v, p.unit))} /></div>
          <div class="small mono">{p.unit}</div>
        </Ring>
        <div class="summary-side">
          <div>
            <div class="mono">{left >= 0 ? 'Left' : 'Over'}</div>
            <div class="summary-num num">{fmtEnergy(Math.abs(left), p.unit)}</div>
          </div>
          <div>
            <div class="mono">Target</div>
            <div class="summary-num muted num">{fmtEnergy(target, p.unit)}</div>
          </div>
        </div>
      </div>
      <MacroBar n={t} />
    </Card>
  );
}

function Meters() {
  const p = profile.value;
  const t = todayTotals.value;
  const protein = activeTargets.value.protein;
  const rows = [
    protein > 0 ? { k: 'protein' as const, target: protein } : null,
    { k: 'fibre' as const, target: p.targets.fibre },
    { k: 'sugars' as const, target: p.targets.sugars },
    { k: 'sodium' as const, target: p.targets.sodium },
  ].filter(Boolean) as { k: 'protein' | 'fibre' | 'sugars' | 'sodium'; target: number }[];
  return (
    <Card class="meters">
      {rows.map((r, i) => <Meter key={r.k} k={r.k} value={t[r.k]} target={r.target} unit={p.unit} i={i} />)}
    </Card>
  );
}

function MealRow({ m, i, onOpen }: { m: Meal; i: number; onOpen: () => void }) {
  const row = useRef<HTMLDivElement>(null);
  const face = useRef<HTMLButtonElement>(null);
  const [gone, setGone] = useState(false);
  const unit = profile.value.unit;

  const remove = async () => {
    hapticConfirm();
    setGone(true);
    await new Promise(r => setTimeout(r, dur('exit')));
    const removed = await removeMeal(m.id);
    if (removed) toast('Meal deleted', { action: { label: 'Undo', run: () => { void logMeal(removed); } } });
  };

  useEffect(() => {
    const el = face.current;
    if (!el) return;
    let width = 1;
    let moved = false;
    return track(el, {
      axis: 'x',
      onStart: () => { width = el.offsetWidth; moved = false; },
      onMove: d => {
        moved = true;
        const x = Math.min(0, d);
        el.style.transition = 'none';
        el.style.transform = `translateX(${x}px)`;
        row.current?.style.setProperty('--reveal', String(Math.min(1, -x / (width * SWIPE_COMMIT_FRACTION))));
      },
      onEnd: (d, v) => {
        el.style.transition = '';
        if (-d > width * SWIPE_COMMIT_FRACTION || (v < -FLING_PX_PER_MS && d < -40)) {
          el.style.transform = `translateX(${-width}px)`;
          void remove();
        } else {
          el.style.transform = '';
          row.current?.style.setProperty('--reveal', '0');
        }
        if (moved) { const stop = (e: Event) => { e.stopPropagation(); e.preventDefault(); }; el.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => el.removeEventListener('click', stop, { capture: true }), 50); }
      },
      onCancel: () => { el.style.transition = ''; el.style.transform = ''; row.current?.style.setProperty('--reveal', '0'); },
    });
  }, []);

  return (
    <div ref={row} class={`meal-row rise${gone ? ' gone' : ''}`} style={{ '--i': i + 3 } as JSX.CSSProperties}>
      <div class="meal-under" aria-hidden="true"><Trash /><span>Delete</span></div>
      <button ref={face} class="meal-face" onClick={() => { tap(); onOpen(); }}>
        {m.thumb ? <img class="meal-thumb" src={m.thumb} alt="" /> : <span class="meal-thumb blank"><Pen /></span>}
        <span class="grow">
          <span class="meal-title">{m.dish}</span>
          <span class="meal-meta">{fmtTime(m.at)}{m.swappedFrom ? ` · Swap for ${m.swappedFrom}` : ''}</span>
        </span>
        <span class="meal-kj num">{fmtEnergy(m.totals.kcal, unit)}</span>
      </button>
    </div>
  );
}

function Empty() {
  return (
    <Card class="empty rise" style={{ '--i': 3 } as JSX.CSSProperties}>
      <Mark class="empty-mark" />
      <div class="empty-title">No meals yet</div>
      <div class="row empty-actions">
        <Button variant="primary" onClick={openScan}><Camera />Scan food</Button>
      </div>
    </Card>
  );
}

export function Today() {
  const [open, setOpen] = useState<Meal | null>(null);
  const list = todays.value;
  return (
    <div class="screen today">
      <header class="screen-head rise">
        <div>
          <div class="mono">{fmtDay(new Date(`${today.value}T12:00:00`).getTime())}</div>
          <h1>Today</h1>
        </div>
      </header>
      <Summary />
      <Section title="Meals" i={2} end={list.length ? <span class="mono">{list.length}</span> : undefined}>
        {loaded.value && !list.length ? <Empty /> : (
          <div class="meal-list">{list.map((m, i) => <MealRow key={m.id} m={m} i={i} onOpen={() => setOpen(m)} />)}</div>
        )}
      </Section>
      <Section title="Progress" i={3}><Progress /></Section>
      <Section title="Targets" i={4}><Meters /></Section>
      {open && <MealSheet meal={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
