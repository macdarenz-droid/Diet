# Design

Last updated 2026-10-24. The visual and interaction language. Tokens are defined once in `src/ui/styles.css` (`tokens:start` … `tokens:end`) and mirrored for script in `src/ui/motion.ts`.

## Direction

Quiet, precise, dense where it matters. The references are Linear (near-black surfaces, hairline borders, tight type) and Vercel (monochrome actions, mono metadata, crisp geometry). Colour is reserved for data. Nothing decorative moves; everything that moves explains a change of state.

## Colour

Two themes, chosen per device: **Night** (default) and **Day**. Interface colour is monochrome; primary buttons are ink on paper (white on Night, black on Day).

| Token | Night | Day |
|---|---|---|
| `--bg` | `#08090a` | `#fbfbfa` |
| `--surface-1` | `#0e0f11` | `#ffffff` |
| `--surface-2` | `#141518` | `#f4f4f2` |
| `--line` | `rgb(255 255 255 / .07)` | `rgb(0 0 0 / .07)` |
| `--line-strong` | `rgb(255 255 255 / .13)` | `rgb(0 0 0 / .13)` |
| `--ink` | `#f7f8f8` | `#0b0b0c` |
| `--ink-2` | `#8a8f98` | `#5d5f66` |
| `--ink-3` | `#5c6068` | `#8d9097` |

Data colours (validated with the dataviz palette checker on both surfaces, all pairs: colour-blind separation ≥ 9.2, normal vision ≥ 20.9):

| Series | Night | Day |
|---|---|---|
| Protein | `#3987e5` | `#2a78d6` |
| Carbs | `#d95926` | `#eb6834` |
| Fat | `#199e70` | `#1baf7a` |

Day fat sits below 3:1 against the surface, so every macro mark carries a visible label and value. Status colours (`good #0ca30c`, `critical #d03b3b`) are used only for swap differences and always with an arrow and the signed value, never colour alone. Text never takes a series colour.

## Type

Inter Variable for everything people read; Geist Mono Variable for metadata, units and small caps labels. Numbers use tabular figures.

| Role | Size / line | Weight | Tracking |
|---|---|---|---|
| Display (energy total) | 44 / 1.0 | 600 | -0.035em |
| Title | 22 / 1.2 | 600 | -0.02em |
| Heading | 15 / 1.3 | 600 | -0.01em |
| Body | 14 / 1.5 | 450 | -0.005em |
| Small | 12.5 / 1.4 | 500 | 0 |
| Mono label | 11 / 1.2 | 500 | 0.06em, uppercase |

## Space, shape, depth

4 px grid. Radii 10 (controls), 14 (cards), 22 (sheets). Depth comes from surface steps and a 1 px top highlight (`inset 0 1px 0 rgb(255 255 255 / .04)` on Night), not from heavy shadows. Phone gutter 16 px; content max width 520 px, centred on larger screens.

## Motion

| Token | ms | Use |
|---|---|---|
| `press` | 100 | press scale |
| `fast` | 150 | hovers, colour |
| `base` | 200 | small state changes |
| `enter` | 280 | screens and cards entering |
| `exit` | 180 | leaving |
| `sheet` | 340 | sheets |
| `stagger` | 36 | per list item |
| `count` | 700 | number tweens |

Curves: `standard cubic-bezier(.2,0,0,1)`, `enter cubic-bezier(.05,.7,.1,1)`, `exit cubic-bezier(.3,0,.8,.15)`, `drawer cubic-bezier(.32,.72,0,1)`.

- Screens: forward slides in 24 px with a fade and a 4 px blur clearing; back reverses. The View Transitions API runs it where available; elsewhere the entering screen animates on its own.
- Lists stagger in by index. Charts grow from zero after their row has landed. Totals count up.
- Presses scale to 0.97 with a light haptic on Android. Hover (pointer devices) raises borders and runs a spotlight that follows the cursor across cards.
- Reduce motion (system setting or Profile): transforms and blur are dropped, fades shorten to 120 ms, counts jump to their value.

## Gestures

Constants and the pointer tracker come from M/ARC's `src/ui/gesture.ts` (slop 8 px, axis lock 1.2, fling 0.4 px/ms, sheet closes past 25 % of its height).

- Sheets drag down to close, with rubber-banding past the top.
- Meals in Today swipe left to reveal Delete; past half the width deletes, with Undo in a toast.
- Swaps scroll sideways with snap points; the centred card is full size, its neighbours recede.
- Toasts swipe away.

## Copy

Rules in AGENTS.md ("UI copy", "No AI wording"). Headings are one to three words. Buttons are verbs: "Take photo", "Describe", "Log meal", "Use swap". Progress lines name the actual step: "Reading photo", "Weighing portions", "Building swaps", "Matching foods". The screens never hedge or name data sources (owner, 2026-10-24: approximation is understood): no "estimate", "approximately", "likely", "confidence", ranges or "USDA". Sources and ranges stay in the data. `tests/copy.test.ts` enforces this.
