import { useState } from 'preact/hooks';
import { fmtShortDay, sameDay } from '@/core/dates';
import { fmt } from '@/core/units';
import { Sheet } from '@/ui/Sheet';
import { Button } from '@/ui/primitives';
import { Trash } from '@/ui/icons';
import { confirm as hapticConfirm } from '@/ui/haptics';
import { toast } from '@/app/toast';
import { logWeight, removeWeight, restoreWeight, weighIns } from './body';

/** The engine's accepted range (docs/METABOLISM.md, section 9). */
export const KG_MIN = 25;
export const KG_MAX = 350;

export function parseKg(s: string): number | null {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n >= KG_MIN && n <= KG_MAX ? Math.round(n * 10) / 10 : null;
}

export function WeightSheet({ onClose }: { onClose: () => void }) {
  const list = weighIns.value;
  const last = list.at(-1);
  const [draft, setDraft] = useState(last ? String(last.kg) : '');
  const kg = parseKg(draft);
  const recent = list.slice(-8).reverse();

  const save = async (close: () => void) => {
    if (kg === null) return;
    hapticConfirm();
    const ok = await logWeight(kg);
    close();
    toast(ok ? 'Weight logged' : 'Not saved on this device');
  };

  const del = async (at: number) => {
    const removed = await removeWeight(at);
    if (removed) toast('Weigh-in deleted', { action: { label: 'Undo', run: () => { void restoreWeight(removed); } } });
  };

  return (
    <Sheet title="Weight" onClose={onClose}>
      {close => (
        <form class="stack weight-form" onSubmit={e => { e.preventDefault(); void save(close); }}>
          <span class="input-wrap weight-input">
            <input
              class="input num"
              inputMode="decimal"
              enterKeyHint="done"
              autoFocus
              value={draft}
              onInput={e => setDraft((e.target as HTMLInputElement).value.replace(/[^0-9.,]/g, '').slice(0, 5))}
              aria-label="Weight in kilograms"
              aria-invalid={draft !== '' && kg === null}
            />
            <span class="suffix">kg</span>
          </span>
          <Button variant="primary" type="submit" block disabled={kg === null}>Log weight</Button>
          {recent.length > 0 && (
            <div class="section weight-recent">
              <div class="section-head"><h2>Recent</h2></div>
              <div class="list">
                {recent.map(w => (
                  <div key={w.at} class="li">
                    <span class="grow title">{sameDay(w.at, Date.now()) ? 'Today' : fmtShortDay(w.at)}</span>
                    <span class="num">{fmt(w.kg)} kg</span>
                    <button type="button" class="icon-btn" aria-label={`Delete ${fmt(w.kg)} kg on ${fmtShortDay(w.at)}`} onClick={() => void del(w.at)}><Trash /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
      )}
    </Sheet>
  );
}
