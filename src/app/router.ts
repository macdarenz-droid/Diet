// A small history-backed router. Screens are a signal; Back (browser, Android gesture) pops the
// top sheet first, then the screen. Transitions use the View Transitions API where present.
import { signal } from '@preact/signals';
import { reduced } from '@/ui/motion';

export type Route = 'today' | 'profile' | 'analysing' | 'result';
export type Direction = 'forward' | 'back' | 'fade';

export const route = signal<Route>('today');
export const direction = signal<Direction>('fade');

const TABS: Route[] = ['today', 'profile'];
const hasHistory = () => typeof history !== 'undefined' && typeof window !== 'undefined';

interface SheetEntry { id: string; close: () => void }
const sheets: SheetEntry[] = [];

function swap(next: Route, dir: Direction): void {
  const doc = typeof document !== 'undefined' ? document : null;
  const vt = doc && 'startViewTransition' in doc && !reduced()
    ? (doc as Document & { startViewTransition: (cb: () => void) => { finished: Promise<void> } })
    : null;
  if (!vt || route.value === next) { direction.value = dir; route.value = next; return; }
  const html = doc!.documentElement;
  html.classList.add(`vt-${dir}`);
  // The view transition snapshots the old screen, then this callback renders the new one.
  const t = vt.startViewTransition(() => { direction.value = 'fade'; route.value = next; });
  // A newer navigation skips this one; its promises then reject, which is expected.
  t.ready.catch(() => {});
  t.finished.catch(() => {}).finally(() => html.classList.remove(`vt-${dir}`));
}

/** Goes to a screen. Tabs replace each other; other screens push a history entry. */
export function go(next: Route, opts: { replace?: boolean } = {}): void {
  if (next === route.value) return;
  const isTab = TABS.includes(next) && TABS.includes(route.value);
  const dir: Direction = isTab ? 'fade' : 'forward';
  if (hasHistory()) {
    try {
      // A sheet that is closing while we navigate hands its history entry to the new screen.
      const onSheet = !!(history.state as { sheet?: string } | null)?.sheet;
      if (opts.replace || isTab || onSheet) history.replaceState({ route: next }, '');
      else history.pushState({ route: next }, '');
    } catch { /* sandboxed */ }
  }
  swap(next, dir);
}

/** Back from a pushed screen; falls back to Today when there is nothing to pop. */
export function back(): void {
  if (hasHistory() && (history.state as { route?: Route } | null)?.route && history.length > 1) { history.back(); return; }
  swap('today', 'back');
}

export function registerSheet(id: string, close: () => void): void {
  sheets.push({ id, close });
  if (hasHistory()) { try { history.pushState({ ...(history.state ?? {}), sheet: id }, ''); } catch { /* sandboxed */ } }
}

/** Called when a sheet closes from the UI: removes its history entry if it is still on top. */
export function unregisterSheet(id: string): void {
  const i = sheets.findIndex(s => s.id === id);
  if (i < 0) return;
  sheets.splice(i, 1);
  if (hasHistory() && (history.state as { sheet?: string } | null)?.sheet === id) { ignorePops++; history.back(); }
}

/** popstate events caused by our own history.back(), not by the person. */
let ignorePops = 0;

export function initRouter(): void {
  if (!hasHistory()) return;
  try {
    // A reload on a pushed screen or an open sheet leaves its entry on top of Today's; step back onto
    // it so the first Back after a reload does something. Tabs replace their entry, so they never do.
    const st = history.state as { route?: Route; sheet?: string } | null;
    if (st && (st.sheet || st.route === 'analysing' || st.route === 'result') && history.length > 1) { ignorePops++; history.back(); }
    else history.replaceState({ route: 'today' }, '');
  } catch { /* sandboxed */ }
  window.addEventListener('popstate', e => {
    if (ignorePops > 0) { ignorePops--; return; }
    const top = sheets.pop();
    if (top) { top.close(); return; }
    const r = (e.state as { route?: Route } | null)?.route ?? 'today';
    swap(r, 'back');
  });
}
