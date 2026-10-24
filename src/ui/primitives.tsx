import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { tap } from './haptics';
import { dur, outExpo, reduced } from './motion';

type BtnProps = JSX.HTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'lg'; block?: boolean; disabled?: boolean; type?: 'button' | 'submit' };

export function Button({ variant = 'secondary', size, block, class: cls, onClick, children, type = 'button', ...rest }: BtnProps) {
  return (
    <button
      type={type}
      class={['btn', variant, size, block && 'block', cls].filter(Boolean).join(' ')}
      onClick={e => { tap(); onClick?.(e); }}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Tracks the pointer across an element so .spot can draw its spotlight and edge light. */
export function useSpotlight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    };
    el.addEventListener('pointermove', move);
    return () => { el.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, []);
  return ref;
}

export function Card({ children, class: cls, pad = true, spot = true, onClick, style, ...rest }: JSX.HTMLAttributes<HTMLDivElement> & { pad?: boolean; spot?: boolean }) {
  const ref = useSpotlight<HTMLDivElement>();
  const interactive = !!onClick;
  return (
    <div
      ref={ref}
      class={['card', pad && 'pad', spot && 'spot', interactive && 'hoverable pressable', cls].filter(Boolean).join(' ')}
      onClick={interactive ? e => { tap(); (onClick as (e: Event) => void)(e); } : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (onClick as (e: Event) => void)(e); } } : undefined}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const btn = el.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
      if (btn) setThumb({ x: btn.offsetLeft - 3, w: btn.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, options.length]);
  return (
    <div ref={wrap} class="seg" role="group" aria-label={label}>
      {thumb && <span class="thumb" style={{ width: `${thumb.w}px`, transform: `translateX(${thumb.x}px)` }} />}
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => { if (o.value !== value) { tap(); onChange(o.value); } }}>{o.label}</button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" class="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => { tap(); onChange(!checked); }} />;
}

export function Choices<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div class="choices" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" class="choice" aria-pressed={o.value === value} onClick={() => { tap(); onChange(o.value); }}>{o.label}</button>
      ))}
    </div>
  );
}

/** A number that eases from its previous value to the new one. */
export function CountUp({ value, format = v => String(Math.round(v)) }: { value: number; format?: (v: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  const first = useRef(true);
  useEffect(() => {
    const start = first.current ? 0 : from.current;
    first.current = false;
    const ms = dur('count');
    if (reduced() || ms === 0 || start === value) { setShown(value); from.current = value; return; }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = outExpo(Math.min(1, (t - t0) / ms));
      const v = start + (value - start) * k;
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span class="num">{format(shown)}</span>;
}

export function Section({ title, end, children, i }: { title: string; end?: ComponentChildren; children: ComponentChildren; i?: number }) {
  return (
    <section class="section rise" style={{ '--i': i ?? 0 } as JSX.CSSProperties}>
      <div class="section-head"><h2>{title}</h2>{end}</div>
      {children}
    </section>
  );
}
