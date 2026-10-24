// Bottom sheet: slides up, drags down to close by its handle or header, rubber-bands when pulled
// up, and closes on Back, Escape or a tap outside.
import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { registerSheet, unregisterSheet } from '@/app/router';
import { FLING_PX_PER_MS, SHEET_CLOSE_FRACTION, rubber, track } from './gesture';
import { dur } from './motion';
import { Close } from './icons';

let seq = 0;

/** children may be a function of `close`, which runs the exit animation before onClose. */
export function Sheet({ title, onClose, children, actions, label }: { title?: string; label?: string; onClose: () => void; children: ComponentChildren | ((close: () => void) => ComponentChildren); actions?: ComponentChildren }) {
  const [id] = useState(() => `sheet-${++seq}`);
  const [state, setState] = useState<'enter' | 'open' | 'closing'>('enter');
  const sheet = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const grab = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const el = sheet.current;
    if (el) { el.style.transform = ''; el.classList.remove('dragging'); }
    setState('closing');
    setTimeout(onClose, dur('exit'));
  };

  useLayoutEffect(() => {
    const r = requestAnimationFrame(() => setState('open'));
    return () => cancelAnimationFrame(r);
  }, []);

  useEffect(() => {
    registerSheet(id, close);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; unregisterSheet(id); };
  }, []);

  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const drag = (d: number) => {
      el.classList.add('dragging');
      el.style.transform = `translateY(${d >= 0 ? d : -rubber(-d)}px)`;
    };
    const end = (d: number, v: number) => {
      el.classList.remove('dragging');
      if (d > el.offsetHeight * SHEET_CLOSE_FRACTION || v > FLING_PX_PER_MS) close();
      else el.style.transform = '';
    };
    const cancel = () => { el.classList.remove('dragging'); el.style.transform = ''; };
    // The handle and header own the drag (touch-action: none); the body keeps native scrolling.
    const off = grab.current ? track(grab.current, { axis: 'y', capture: 'down', canStart: e => !(e.target as HTMLElement).closest('button, a, input'), onMove: drag, onEnd: end, onCancel: cancel }) : undefined;
    return () => off?.();
  }, []);

  return createPortal(
    <>
      <div class={`scrim${state === 'closing' ? ' closing' : ''}`} onClick={close} />
      <div ref={sheet} class={`sheet${state === 'open' ? ' open' : ''}${state === 'closing' ? ' closing' : ''}`} role="dialog" aria-modal="true" aria-label={title ?? label}>
        <div ref={grab} class="sheet-top">
          <div class="grab" />
          {title && (
            <div class="sheet-head">
              <h2>{title}</h2>
              <div class="row">{actions}<button class="icon-btn" aria-label="Close" onClick={close}><Close /></button></div>
            </div>
          )}
        </div>
        <div ref={body} class="sheet-body">{typeof children === 'function' ? children(close) : children}</div>
      </div>
    </>,
    document.body,
  );
}
