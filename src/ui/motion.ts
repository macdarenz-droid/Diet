// Motion tokens (mirror src/ui/styles.css, tokens:start..tokens:end) and the reduced-motion state.
// Pattern from M/ARC's src/ui/motion.ts. Guarded for node: tests import this module without a DOM.
import { effect } from '@preact/signals';
import { prefs } from '@/core/store';

export const DUR = { press: 100, fast: 150, base: 200, enter: 280, exit: 180, sheet: 340, stagger: 36, count: 700 } as const;
export const REDUCED_DUR = { ...DUR, enter: 120, exit: 100, sheet: 160, stagger: 0, count: 0 } as const;
export type DurKey = keyof typeof DUR;

export const EASE = {
  standard: 'cubic-bezier(.2,0,0,1)',
  enter: 'cubic-bezier(.05,.7,.1,1)',
  exit: 'cubic-bezier(.3,0,.8,.15)',
  drawer: 'cubic-bezier(.32,.72,0,1)',
} as const;

const hasDom = () => typeof document !== 'undefined' && typeof matchMedia === 'function';
const mq = hasDom() ? matchMedia('(prefers-reduced-motion: reduce)') : null;

export function reduced(): boolean {
  return hasDom() && document.documentElement.dataset.motion === 'reduce';
}

export function dur(key: DurKey): number {
  return (reduced() ? REDUCED_DUR : DUR)[key];
}

export function osReducedMotion(): boolean {
  return !!mq?.matches;
}

function apply(): void {
  if (!hasDom()) return;
  const on = !!mq?.matches || prefs.value.reduceMotion;
  if (on) document.documentElement.dataset.motion = 'reduce';
  else delete document.documentElement.dataset.motion;
}

export function initMotion(): void {
  if (!hasDom()) return;
  mq?.addEventListener('change', apply);
  effect(apply);
}

/** easeOutExpo, for number tweens. */
export const outExpo = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
