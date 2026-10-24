# Architecture

Last updated 2026-10-24. One document for the system design; `docs/DESIGN.md` covers the visual language.

## 1. Goal

Take a photo or a description of food, return an itemised nutrition breakdown with honest ranges, and offer healthier swaps that keep what the person likes about the original (taste, texture, ingredient or occasion). Users: the owner and a few friends in Australia and the Philippines. Installed from the browser to the home screen on Android and iOS; app-store builds come later.

## 2. Shape

A static Progressive Web App, hosted on GitHub Pages from `main` (`.github/workflows/pages.yml`). No server and no accounts. The browser talks straight to the APIs below; everything else stays on the device.

```
 Phone (PWA)
 ├─ UI (Preact + signals)
 ├─ Analysis pipeline ──► api.anthropic.com      Claude: read photo/text, items, swaps
 │                    └─► api.nal.usda.gov       USDA FoodData Central: per-100 g nutrients
 ├─ localStorage   profile, settings, keys, USDA cache, usage
 └─ IndexedDB      meal log with small photo thumbnails
```

### Network

These are the only hosts a build may contact. `index.html` sets a Content-Security-Policy whose `connect-src` lists exactly these, so anything else is blocked by the browser.

| Host | Why | Sends |
|---|---|---|
| `api.anthropic.com` | analysis and swaps | the photo (downscaled JPEG) or text, profile preferences, the user's Claude key |
| `api.nal.usda.gov` | nutrient data | a generic food name such as "rice, fried" and the user's USDA key |

Fonts and icons are bundled; no third-party scripts, analytics or font CDNs.

Verified on 2026-10-24 from this repo's container: both hosts answer browser CORS preflights (`access-control-allow-origin: *`), and Anthropic's preflight allows the `anthropic-dangerous-direct-browser-access` header that the SDK's `dangerouslyAllowBrowser` option sends.

## 3. Stack

Same base as M/ARC, so patterns and tooling carry over.

| Part | Choice | Version |
|---|---|---|
| Build | Vite | 7.3 |
| UI | Preact + @preact/signals | 10.29 / 2.11 |
| Language | TypeScript (strict) | 5.9 |
| Tests | Vitest | 5.0 (3.x has open advisories) |
| Claude | @anthropic-ai/sdk | 1.3.0, pinned |
| Fonts | Inter Variable, Geist Mono Variable (fontsource, bundled) | 5.3 |

No router, state or CSS library: a small history-backed router, signals for state and hand-written CSS tokens keep the bundle small and the motion fully under our control. The Claude SDK (about 82 kB gzipped) is split out and fetched when the scan sheet opens, so the app starts on about 31 kB of script.

## 4. Source layout

```
src/
  main.tsx              boot: theme, motion preference, service worker
  app/                  App shell, router, tab bar, toasts, haptics
  core/                 models.ts (types) · store.ts (signals + localStorage) · db.ts (IndexedDB) · dates.ts · units.ts
  ai/                   transport.ts (SDK client) · prompts.ts · schema.ts (output schema + validation) · analyze.ts (one call, streamed)
  nutrition/            fdc.ts (USDA client + parsing) · ground.ts (match items to USDA) · math.ts (totals, ranges, deltas)
  slices/
    today/              daily totals and the meal list
    scan/               capture sheet, image downscale
    result/             breakdown, item editor, follow-up questions, swaps
    meal/               a logged meal
    profile/            goal, diet, region, units, keys, usage
  ui/                   styles.css (tokens) · motion.ts · gesture.ts · Sheet · primitives · icons · charts
tests/                  unit tests, one file per module
scripts/                screens.mjs (every screen at phone size, Claude and USDA mocked, gestures and offline start checked) · icons.mjs (PWA icons)
```

## 5. Analysis pipeline

One scan, start to finish:

1. **Capture.** Camera or library through `<input type="file" accept="image/*">` (with `capture` for the camera), or a typed description. Photos are downscaled on a canvas to a long edge of 1568 px, JPEG quality 0.85, before they leave the device. A 320 px thumbnail is kept for the log.
2. **Read** (one Claude call, streamed). Model `claude-opus-5-5`, adaptive thinking, effort `high` (accuracy first; one constant in `src/ai/config.ts`). Structured output (`output_config.format`, JSON schema in `src/ai/schema.ts`) returns:
   - the dish, its kind and an overall confidence;
   - items, each with a best-guess weight in grams plus a low–high range, the cooking method, a generic USDA search name, and Claude's own per-100 g estimate;
   - a visible nutrition panel copied exactly as printed (energy and its unit, per 100 g or per serving with the serving size); the code converts it to per-100 g kcal, so no model arithmetic reaches the numbers;
   - up to two follow-up questions with tap answers ("Fried or grilled?");
   - three to five swaps, each a full replacement meal (its own items and grams), what it keeps, its kind (ingredient, method, dish, product, portion) and its effort.
   Progress shown to the user follows real stream events (request sent, thinking, writing items, writing swaps), never a timer.
3. **Ground.** Each distinct USDA search name is looked up in FoodData Central (Foundation, SR Legacy and Survey/FNDDS data types; values per 100 g). The best candidate is chosen by name overlap and by closeness of its energy to Claude's estimate; a candidate more than 60% off is rejected. Each item then carries its source internally: label, USDA (with the food's name and FDC id) or Claude's estimate. The screens do not show sources, ranges or confidence (owner, 2026-10-24); they stay in the data for tuning and future features. Results are cached for 30 days. Without a USDA key, or when USDA rate-limits, items keep Claude's estimate.
4. **Compute.** Totals, ranges and swap differences are plain arithmetic in `src/nutrition/math.ts` (grams × per-100 g ÷ 100), never asked of the model. Editing an item's grams recomputes everything instantly without another call.
5. **Refine.** Answering a follow-up question re-runs step 2 with the same image and the answer, then grounds again (cached lookups are free).
6. **Log.** The meal, or a chosen swap in its place, is saved to IndexedDB with its thumbnail.

Nutrients tracked: energy, protein, carbohydrate, fat, saturated fat, fibre, sugars, sodium. Energy shows in kJ (Australian default) or kcal (Philippine default); 1 kcal = 4.184 kJ.

USDA nutrient ids used (checked against a live response on 2026-10-24): 1008 energy (kcal; Foundation foods may carry the Atwater energies instead: 2048 specific factors first, then 2047 general), 1003 protein, 1005 carbohydrate, 1004 fat, 1258 saturated fat, 1079 fibre, 2000 total sugars (1063 as fallback), 1093 sodium (mg).

## 6. Data on the device

| Store | Key | Holds |
|---|---|---|
| localStorage | `nuance.profile` | goal, diet, foods to avoid, region, energy unit, daily targets |
| localStorage | `nuance.keys` | Claude key, USDA key |
| localStorage | `nuance.prefs` | theme, reduce motion |
| localStorage | `nuance.usage` | per month: scans, follow-up refines and token counts (failed calls included) |
| localStorage | `nuance.fdc.*` | USDA lookups, 30-day expiry |
| IndexedDB `nuance` / `meals` | meal id | logged meals: time, dish, grounded items, totals, chosen swap, thumbnail |

Day boundaries use the device's local time zone (tests run in Sydney and Manila).

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| A Claude key in browser storage can be read by anyone holding the unlocked phone, or by injected script | strict CSP (`script-src 'self'`, `connect-src` limited to §2), no third-party scripts, model text rendered as text only; one key per person with a monthly spend limit set in the Anthropic Console; a relay (like M/ARC's Escobar Worker) replaces direct calls before any public release |
| Photo portion estimates are approximate (hidden oil, sauces, depth) | follow-up questions; grams are editable; ranges and sources kept in the data |
| USDA coverage of Filipino and Australian dishes is thin | Claude's estimate stays the fallback and is labelled; regional tables (FSANZ AFCD, FNRI PhilFCT) are a later step once their licences are checked |
| USDA demo key is shared and rate-limited (it reported 10 per hour and was already used up when tested) | each person adds a free personal key; lookups are cached |
| A model or API change breaks parsing | schema-validated output, typed SDK errors, the stop reason checked before content; server-side refusal fallback (`fallbacks: "default"`) enabled |
| Cost per scan is not yet measured | token usage is recorded per call and shown in Profile; the first real-device runs set the baseline |
| iOS limits for home-screen apps (storage can be cleared after long disuse, no vibration API) | the log stays small; haptics degrade silently; export lands with accounts |

## 8. Offline and updates

The service worker (`src/sw.template.js`, filled in at build time) precaches the app shell, the Latin font subsets and the Claude client, so the app opens with no network; analysis itself needs one. Cached files are matched with `ignoreVary`, because hosts send `Vary: Origin` and module scripts are requested with an Origin header (without it the app failed to start offline in testing). A new build installs in the background and offers "Update ready · Reload".

## 9. Roadmap

1. **Now:** capture → breakdown → swaps → log, profile, keys, PWA install.
2. **Next:** barcode lookup (Open Food Facts), recipe makeover from pasted text, cravings mode, swap feedback that tunes later suggestions.
3. **Later:** accounts and sync, a relay for keys, regional food tables, weekly patterns, Capacitor builds for the Play Store and App Store.
