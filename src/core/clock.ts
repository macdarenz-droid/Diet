// The local day as a signal, so anything that depends on "today" moves to the next day at midnight
// and when the app comes back from the background (a home-screen app can stay open for days).
import { signal } from '@preact/signals';
import { dayKey } from './dates';

export const today = signal(dayKey(Date.now()));

export function tick(now = Date.now()): void {
  const k = dayKey(now);
  if (k !== today.value) today.value = k;
}

export function initClock(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  setInterval(() => tick(), 30_000);
}
