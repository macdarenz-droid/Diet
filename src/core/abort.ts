// One signal that aborts when any input aborts, plus a timeout that reports itself.
// AbortSignal.any / AbortSignal.timeout are missing on older WebViews, so this does it by hand.
export interface Timed { signal: AbortSignal; timedOut: () => boolean; clear: () => void }

export function withTimeout(parent: AbortSignal | undefined, ms: number): Timed {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, ms);
  const onAbort = () => ctrl.abort();
  if (parent?.aborted) ctrl.abort();
  else parent?.addEventListener('abort', onAbort, { once: true });
  return {
    signal: ctrl.signal,
    timedOut: () => timedOut,
    clear: () => { clearTimeout(timer); parent?.removeEventListener('abort', onAbort); },
  };
}

/** A watchdog: aborts after `ms` without a call to `kick()`. */
export function idleWatch(parent: AbortSignal | undefined, firstMs: number, idleMs: number) {
  const ctrl = new AbortController();
  let stalled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number) => { clearTimeout(timer); timer = setTimeout(() => { stalled = true; ctrl.abort(); }, ms); };
  const onAbort = () => ctrl.abort();
  if (parent?.aborted) ctrl.abort();
  else parent?.addEventListener('abort', onAbort, { once: true });
  arm(firstMs);
  return {
    signal: ctrl.signal,
    kick: () => arm(idleMs),
    stalled: () => stalled,
    clear: () => { clearTimeout(timer); parent?.removeEventListener('abort', onAbort); },
  };
}
