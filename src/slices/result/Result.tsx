import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { profile } from '@/core/store';
import { fmtEnergy } from '@/core/units';
import { totals } from '@/nutrition/math';
import { Button, Card, Section } from '@/ui/primitives';
import { Back, Check, Pen, Refresh } from '@/ui/icons';
import { confirm as hapticConfirm, tap } from '@/ui/haptics';
import { back, go } from '@/app/router';
import { toast } from '@/app/toast';
import { openScan } from '@/app/scan';
import { dur } from '@/ui/motion';
import { logMeal } from '@/slices/today/meals';
import { answer, current, removeItem, scan, select, setGrams, toMeal } from '@/slices/scan/session';
import { failText } from '@/slices/scan/Analysing';
import { Breakdown, ItemList } from './Breakdown';
import { ItemSheet } from './ItemSheet';
import { Swaps } from './Swaps';

const KIND = { meal: 'Meal', snack: 'Snack', drink: 'Drink', packaged: 'Packaged' } as const;

function Questions() {
  const s = scan.value!;
  const qs = s.analysis!.questions.filter(q => !s.answers.some(a => a.question === q.text));
  const answered = s.answers;
  if (!qs.length && !answered.length) return null;
  return (
    <Section title="Questions" i={2}>
      <div class="stack">
        {qs.map(q => (
          <Card key={q.id} class="question">
            <div class="q-text">{q.text}</div>
            <div class="choices">
              {q.options.map(o => <button key={o} class="choice" disabled={s.refining} onClick={() => { tap(); answer(q.text, o); }}>{o}</button>)}
            </div>
          </Card>
        ))}
        {answered.map(a => (
          <div key={a.question} class="answered"><Check /><span class="muted">{a.question}</span><span>{a.answer}</span></div>
        ))}
      </div>
    </Section>
  );
}

export function Result() {
  const s = scan.value;
  const c = current.value;
  const p = profile.value;
  const [edit, setEdit] = useState<number | null>(null);

  useEffect(() => { if (!s) go('today', { replace: true }); }, [s]);
  useEffect(() => { if (s?.error && s.phase === 'ready') toast(failText(s.error.kind)); }, [s?.error]);
  // Edits wait while a follow-up answer re-runs the analysis; the refreshed items keep them by name.
  useEffect(() => { if (s?.refining) setEdit(null); }, [s?.refining]);
  if (!s || !c) return <div class="screen bare" />;

  const a = c.analysis;
  const chosen = s.selected ? c.swaps.find(w => w.id === s.selected) : undefined;
  const logged = chosen ? totals(chosen.items) : c.meal;

  const log = async () => {
    const meal = toMeal(s);
    if (!meal) return;
    hapticConfirm();
    await logMeal(meal);
    // Back to the Today entry already in history (the scan is cleared when Today shows), so a logged
    // scan leaves no extra Back step behind.
    back();
    toast(chosen ? 'Swap logged' : 'Meal logged');
  };

  if (!s.found) {
    return (
      <div class="screen bare result">
        <div class="topbar rise"><button class="icon-btn glass" aria-label="Back" onClick={() => { tap(); back(); }}><Back /></button></div>
        <Card class="empty rise" style={{ '--i': 1 } as JSX.CSSProperties}>
          <div class="empty-title">No food found</div>
          <div class="muted">Try a closer photo, or describe the meal.</div>
          <div class="row empty-actions">
            <Button variant="primary" onClick={() => { back(); setTimeout(openScan, dur('enter')); }}>Scan again</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div class={`screen bare result${s.refining ? ' refining' : ''}`}>
      <div class="topbar rise">
        <button class="icon-btn glass" aria-label="Back" onClick={() => { tap(); back(); }}><Back /></button>
        {s.refining && <span class="chip updating"><Refresh class="spin" />Updating</span>}
      </div>

      {s.photo
        ? <img class="hero rise" src={s.photo.url} alt="" style={{ viewTransitionName: 'hero' } as JSX.CSSProperties} />
        : <Card class="hero-text rise"><Pen /><span>{s.text}</span></Card>}

      <header class="result-head rise" style={{ '--i': 1 } as JSX.CSSProperties}>
        <h1>{a.dish}</h1>
        <div class="row result-chips">
          <span class="chip mono">{KIND[a.kind]}</span>
        </div>
      </header>

      <Card class="result-card rise" style={{ '--i': 2 } as JSX.CSSProperties}>
        <Breakdown n={c.meal} unit={p.unit} />
        {a.note && <p class="note">{a.note}</p>}
      </Card>

      <Questions />

      <Section title="Items" i={3} end={<span class="mono num">{a.items.length}</span>}>
        <ItemList items={a.items} unit={p.unit} onEdit={s.refining ? undefined : setEdit} />
      </Section>

      {c.swaps.length > 0 && (
        <Section title="Swaps" i={4} end={<span class="mono num">{c.swaps.length}</span>}>
          <Swaps swaps={c.swaps} original={c.meal} goal={p.goal} unit={p.unit} selected={s.selected} onSelect={select} />
        </Section>
      )}

      <div class="dock">
        <div class="dock-inner">
          <div class="dock-sum">
            <span class="mono">{chosen ? 'Swap' : 'Meal'}</span>
            <span class="num dock-kj">{fmtEnergy(logged.kcal, p.unit)}</span>
          </div>
          <Button variant="primary" size="lg" class="grow" onClick={log} disabled={s.refining}>{chosen ? 'Log swap' : 'Log meal'}</Button>
        </div>
      </div>

      {edit !== null && a.items[edit] && (
        <ItemSheet
          item={a.items[edit]!}
          unit={p.unit}
          onSave={g => setGrams(edit, g)}
          onRemove={() => removeItem(edit)}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}
