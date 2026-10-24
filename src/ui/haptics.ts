// Light haptics where the browser offers them (Android Chrome). iOS Safari has no vibration API,
// so this is silent there.
import { reduced } from './motion';

export function tap(ms = 8): void {
  if (reduced()) return;
  try { navigator.vibrate?.(ms); } catch { /* not allowed */ }
}

export function confirm(): void {
  if (reduced()) return;
  try { navigator.vibrate?.([10, 40, 14]); } catch { /* not allowed */ }
}
