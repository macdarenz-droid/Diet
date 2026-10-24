// Line icons, 24-unit grid, 1.6 stroke. Drawn for this app; colour follows currentColor.
import type { JSX } from 'preact';

type P = JSX.SVGAttributes<SVGSVGElement>;
const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': true } as const;
const icon = (d: JSX.Element) => (p: P) => <svg {...base} {...p}>{d}</svg>;

export const Camera = icon(<><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1.3-1.8A1.6 1.6 0 0 1 10.3 3.5h3.4a1.6 1.6 0 0 1 1.3.7L16.3 6h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" /><circle cx="12" cy="12.5" r="3.4" /></>);
export const Image = icon(<><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m20.5 15.5-4.2-4.2a1.5 1.5 0 0 0-2.1 0L6 19.5" /></>);
export const Pen = icon(<><path d="M4 20h4L18.6 9.4a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16z" /><path d="m13.5 6.5 4 4" /></>);
export const Today = icon(<><rect x="4" y="4.5" width="16" height="15.5" rx="3" /><path d="M4 9.5h16M8.5 3v3M15.5 3v3" /><path d="M8 13.5h3" /></>);
export const User = icon(<><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" /></>);
export const Back = icon(<path d="M14.5 5.5 8 12l6.5 6.5" />);
export const Chevron = icon(<path d="m9.5 6 6 6-6 6" />);
export const Close = icon(<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />);
export const Check = icon(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const Down = icon(<path d="M12 5v14m0 0-5.5-5.5M12 19l5.5-5.5" />);
export const Up = icon(<path d="M12 19V5m0 0-5.5 5.5M12 5l5.5 5.5" />);
export const Trash = icon(<><path d="M4.5 7h15M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" /><path d="M6.5 7l.8 11.2A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.8L17.5 7" /></>);
export const Key = icon(<><circle cx="8" cy="14" r="4" /><path d="m11 11 8-8m-3 3 2.5 2.5M14 8l2 2" /></>);
export const Minus = icon(<path d="M6 12h12" />);
export const Plus = icon(<path d="M12 6v12M6 12h12" />);
export const Swap = icon(<><path d="M5 8.5h12.5m0 0L14 5m3.5 3.5L14 12" /><path d="M19 15.5H6.5m0 0L10 12m-3.5 3.5L10 19" /></>);
export const Arrow = icon(<path d="M5 12h14m0 0-5.5-5.5M19 12l-5.5 5.5" />);
export const Refresh = icon(<><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4.5v4h-4" /></>);
/** The Nuance mark: an N whose diagonal fades between two solid strokes. */
export const Mark = (p: P) => (
  <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...p}>
    <defs>
      <linearGradient id="nuance-mark" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="currentColor" />
        <stop offset="1" stop-color="currentColor" stop-opacity=".22" />
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="30" height="30" rx="9" fill="currentColor" opacity=".08" />
    <g stroke-linecap="round" stroke-width="2.6">
      <path d="M11 10.5v11" stroke="currentColor" />
      <path d="M21 10.5v11" stroke="currentColor" />
      <path d="M11.4 11.1 20.6 20.9" stroke="url(#nuance-mark)" />
    </g>
  </svg>
);
