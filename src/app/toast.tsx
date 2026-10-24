import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { track, TOAST_SWIPE_PX, TOAST_FLING_PX_PER_MS, rubber } from '@/ui/gesture';
import { dur } from '@/ui/motion';

export interface Toast { id: number; text: string; action?: { label: string; run: () => void }; ms: number }

export const toasts = signal<Toast[]>([]);
let next = 1;

export function toast(text: string, opts: { action?: Toast['action']; ms?: number } = {}): number {
  const t: Toast = { id: next++, text, action: opts.action, ms: opts.ms ?? (opts.action ? 8000 : 2600) };
  toasts.value = [...toasts.value.slice(-2), t];
  return t.id;
}

export function dismiss(id: number): void {
  toasts.value = toasts.value.filter(t => t.id !== id);
}

function ToastView({ t }: { t: Toast }) {
  const ref = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const leave = () => { setLeaving(true); setTimeout(() => dismiss(t.id), dur('exit')); };

  // The timer pauses while the toast is touched, hovered or focused, so Undo stays reachable.
  const [held, setHeld] = useState(false);
  const remaining = useRef(t.ms);
  useEffect(() => {
    if (held) return;
    const started = Date.now();
    const timer = setTimeout(leave, remaining.current);
    return () => { clearTimeout(timer); remaining.current = Math.max(800, remaining.current - (Date.now() - started)); };
  }, [t.id, held]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return track(el, {
      axis: 'x',
      canStart: e => !(e.target as HTMLElement).closest('button'),
      onMove: d => { el.style.transition = 'none'; el.style.transform = `translateX(${d}px)`; el.style.opacity = String(1 - Math.min(Math.abs(d) / 220, 0.7)); },
      onEnd: (d, v) => {
        el.style.transition = '';
        if (Math.abs(d) > TOAST_SWIPE_PX || Math.abs(v) > TOAST_FLING_PX_PER_MS) { el.style.transform = `translateX(${Math.sign(d) * 480}px)`; el.style.opacity = '0'; setTimeout(() => dismiss(t.id), 180); }
        else { el.style.transform = ''; el.style.opacity = ''; }
      },
      onCancel: () => { el.style.transition = ''; el.style.transform = `translateX(${rubber(0)}px)`; el.style.opacity = ''; },
    });
  }, []);

  return (
    <div
      ref={ref}
      class={`toast${leaving ? ' leaving' : ''}`}
      role="status"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onPointerDown={() => setHeld(true)}
      onFocusIn={() => setHeld(true)}
      onFocusOut={() => setHeld(false)}
    >
      <span class="grow">{t.text}</span>
      {t.action && <button class="btn sm secondary" onClick={() => { t.action!.run(); leave(); }}>{t.action.label}</button>}
    </div>
  );
}

export function Toasts() {
  return <div class="toasts" aria-live="polite">{toasts.value.map(t => <ToastView key={t.id} t={t} />)}</div>;
}
