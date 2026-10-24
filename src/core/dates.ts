// Local-time day boundaries for the food log. Tests run in Sydney and Manila (npm run test:tz).

export function dayKey(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function sameDay(a: number, b: number): boolean {
  return dayKey(a) === dayKey(b);
}

export function monthKey(ms: number): string {
  return dayKey(ms).slice(0, 7);
}

const dayFmt = new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' });

export function fmtDay(ms: number): string {
  return dayFmt.format(new Date(ms));
}

export function fmtTime(ms: number): string {
  return timeFmt.format(new Date(ms)).replace(/\s?(am|pm)$/i, (_, ap: string) => ` ${ap.toLowerCase()}`);
}

/** "Morning", "Afternoon", "Evening" or "Night", for the meal list's time label. */
export function partOfDay(ms: number): 'Morning' | 'Afternoon' | 'Evening' | 'Night' {
  const h = new Date(ms).getHours();
  if (h >= 5 && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 22) return 'Evening';
  return 'Night';
}
