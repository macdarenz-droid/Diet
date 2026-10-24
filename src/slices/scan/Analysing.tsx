import './scan.css';
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { FailKind } from '@/ai/errors';
import { Button, Card } from '@/ui/primitives';
import { Back, Check, Pen } from '@/ui/icons';
import { tap } from '@/ui/haptics';
import { back, go } from '@/app/router';
import { cancel, retry, scan, type Step } from './session';
import { KeySheet, keySheet } from '@/slices/profile/KeySheet';

const STEPS: { id: Step; photo: string; text: string }[] = [
  { id: 'send', photo: 'Reading photo', text: 'Reading description' },
  { id: 'think', photo: 'Weighing portions', text: 'Weighing portions' },
  { id: 'items', photo: 'Listing items', text: 'Listing items' },
  { id: 'swaps', photo: 'Building swaps', text: 'Building swaps' },
  { id: 'ground', photo: 'Matching foods', text: 'Matching foods' },
];

export function failText(kind: FailKind): string {
  switch (kind) {
    case 'auth': return 'Claude key not accepted.';
    case 'denied': return 'This key does not have access to the model.';
    case 'rate': return 'Too many requests. Try again in a minute.';
    case 'busy': return 'Claude is busy. Try again shortly.';
    case 'network': return 'No connection.';
    case 'refusal': return 'This one could not be analysed.';
    case 'truncated': return 'The response was cut short. Try again.';
    case 'invalid': return 'The response could not be read. Try again.';
    default: return 'Something went wrong. Try again.';
  }
}

function Elapsed() {
  const [since] = useState(Date.now());
  const [now, setNow] = useState(since);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = Math.max(0, Math.floor((now - since) / 1000));
  return <span class="mono num elapsed">{Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}</span>;
}

export function Analysing() {
  const s = scan.value;

  useEffect(() => { if (!s) go('today', { replace: true }); }, [s]);
  useEffect(() => { if (s?.phase === 'ready') go('result', { replace: true }); }, [s?.phase]);
  // Leaving by any route (Back gesture, tab, Cancel) stops a call still in flight, so it costs nothing more.
  useEffect(() => () => { if (scan.value?.phase === 'running') cancel(); }, []);

  if (!s) return <div class="screen bare" />;
  const at = STEPS.findIndex(x => x.id === s.step);
  const failed = s.phase === 'failed';

  return (
    <div class="screen bare analysing">
      <div class="topbar rise">
        <button class="icon-btn glass" aria-label="Cancel" onClick={() => { tap(); back(); }}><Back /></button>
        {!failed && <Elapsed />}
      </div>

      {s.photo ? (
        <div class={`scan-frame rise${failed ? ' stopped' : ''}`}>
          <img src={s.photo.url} alt="" style={{ viewTransitionName: 'hero' } as JSX.CSSProperties} />
          <span class="beam" aria-hidden="true" />
          <span class="corners" aria-hidden="true"><i /><i /><i /><i /></span>
        </div>
      ) : (
        <Card class="hero-text rise"><Pen /><span>{s.text}</span></Card>
      )}

      {failed ? (
        <Card class="fail rise" role="alert" style={{ '--i': 1 } as JSX.CSSProperties}>
          <div class="fail-title">{failText(s.error?.kind ?? 'unknown')}</div>
          <div class="row fail-actions">
            {s.error?.kind === 'auth' || s.error?.kind === 'denied'
              ? <Button variant="primary" onClick={() => { keySheet.value = 'claude'; }}>Update key</Button>
              : <Button variant="primary" onClick={retry}>Try again</Button>}
            <Button variant="ghost" onClick={() => { cancel(); back(); }}>Cancel</Button>
          </div>
        </Card>
      ) : (
        <>
        <p class="visually-hidden" role="status">{(s.photo ? STEPS[at]?.photo : STEPS[at]?.text) ?? ''}</p>
        <ol class="steps">
          {STEPS.map((x, i) => {
            const state = i < at ? 'done' : i === at ? 'now' : 'next';
            return (
              <li key={x.id} class={`step ${state} rise`} aria-current={state === 'now' ? 'step' : undefined} style={{ '--i': i + 1 } as JSX.CSSProperties}>
                <span class="step-mark">{state === 'done' ? <Check /> : <span class="step-dot" />}</span>
                <span>{s.photo ? x.photo : x.text}</span>
              </li>
            );
          })}
        </ol>
        </>
      )}
      {keySheet.value && <KeySheet which={keySheet.value} onClose={() => { keySheet.value = null; }} onSaved={retry} />}
    </div>
  );
}
