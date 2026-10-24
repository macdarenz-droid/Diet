import { signal } from '@preact/signals';
import { tap } from '@/ui/haptics';

/** Whether the scan sheet is open; the tab bar and the empty Today state both open it. */
export const scanSheet = signal(false);

export function openScan(): void {
  tap();
  scanSheet.value = true;
}
