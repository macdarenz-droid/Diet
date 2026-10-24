# Architecture

Last updated 2026-10-24. One document for the system design; `docs/DESIGN.md` covers the visual language.

## 1. Goal

Take a photo or a description of food, return an itemised nutrition breakdown, and offer healthier swaps that keep what the person likes about the original (taste, texture, ingredient or occasion). Set energy and protein targets from the person's body and goal, and adjust them as their weight and log show how their metabolism responds (`docs/METABOLISM.md`). Users: the owner and a few friends in Australia and the Philippines. Installed from the browser to the home screen on Android and iOS; app-store builds come later.

## 2. Shape

A static Progressive Web App, hosted on GitHub Pages from `main` (`.github/workflows/pages.yml`). No server and no accounts. The browser talks straight to the one API below; everything else, food tables included, stays on the device.

```
 Phone (PWA)
 ├─ UI (Preact + signals)
 ├─ Analysis pipeline ──► api.anthropic.com      Claude: read photo/text, items, swaps
 │                    └─► data/foods-*.json      bundled food tables (same origin, precached)
 ├─ Metabolism engine    targets and insights from body details, weigh-ins and the log
 ├─ localStorage   profile (with body details), settings, key, usage
 └─ IndexedDB      meal log with small photo thumbnails, weigh-ins
```

### Network

These are the only hosts a build may contact. `index.html` sets a Content-Security-Policy whose `connect-src` lists exactly these, so anything else is blocked by the browser.

| Host | Why | Sends |
|---|---|---|
| `api.anthropic.com` | analysis and swaps | the photo (downscaled JPEG) or text, profile preferences, the user's Claude key |

Fonts and icons are bundled; no third-party scripts, analytics or font CDNs.

Verified on 2026-10-24 from this repo's container: Anthropic's CORS preflight answers `access-control-allow-origin: *` and allows the `anthropic-dangerous-direct-browser-access` header that the SDK's `dangerouslyAllowBrowser` option sends. Food data is bundled (same origin), so no food lookup leaves the device.

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
  nutrition/            foods.ts (offline tables + search) · lookup.ts (one search per name) · ground.ts (choose and apply a match) · math.ts (totals, ranges, deltas)
  metabolism/           energy, trend weight, measured expenditure, targets, adaptation and plateau detection, insights (docs/METABOLISM.md)
  slices/
    today/              daily totals and the meal list
    body/               body details, weigh-ins, the engine's targets and insights, their wording (words.ts)
    scan/               capture sheet, image downscale
    result/             breakdown, item editor, follow-up questions, swaps
    meal/               a logged meal
    profile/            goal, body, pace, targets, diet, region, units, key, usage, food data licences
  ui/                   styles.css (tokens) · motion.ts · gesture.ts · Sheet · primitives · icons · charts
tests/                  unit tests, one file per module
public/data/            food tables built by scripts/foods/build.mjs (docs/FOOD-DATA.md)
scripts/                screens.mjs (every screen at phone size, Claude mocked, body and weight history seeded, gestures and offline start checked) · icons.mjs (PWA icons)
```

## 5. Analysis pipeline

One scan, start to finish:

1. **Capture.** Camera or library through `<input type="file" accept="image/*">` (with `capture` for the camera), or a typed description. Photos are downscaled on a canvas to a long edge of 1568 px, JPEG quality 0.85, before they leave the device. A 320 px thumbnail is kept for the log.
2. **Read** (one Claude call, streamed). Model `claude-opus-5-5`, adaptive thinking, effort `high` (accuracy first; one constant in `src/ai/config.ts`). Structured output (`output_config.format`, JSON schema in `src/ai/schema.ts`) returns:
   - the dish, its kind and an overall confidence;
   - items, each with a best-guess weight in grams plus a low–high range, the cooking method, a generic food search name (a common local name is allowed), and Claude's own per-100 g values;
   - a visible nutrition panel copied exactly as printed (energy and its unit, per 100 g or per serving with the serving size); the code converts it to per-100 g kcal, so no model arithmetic reaches the numbers;
   - up to two follow-up questions with tap answers ("Fried or grilled?");
   - three to five swaps, each a full replacement meal (its own items and grams), what it keeps, its kind (ingredient, method, dish, product, portion) and its effort.
   Progress shown to the user follows real stream events (request sent, thinking, writing items, writing swaps), never a timer.
3. **Ground.** Each distinct search name (at most 24 a scan) is searched in the bundled food tables: USDA FoodData Central (Foundation, SR Legacy, FNDDS), the FSANZ Australian Food Composition Database and the UK CoFID, 17,174 foods in all, per 100 g, with Filipino and Australian aliases (`docs/FOOD-DATA.md`). The tables load and are indexed in short slices while Claude answers, and each search runs in a task of its own, so the screen keeps painting and Cancel works between searches. A candidate must hold most of the query's words, weighted by rarity, in one of its names, must not be a product made from the food (a sauce, a juice) or a stand-in for it unless the query says so, and must be within 60% of Claude's energy value; among those, the best by search relevance and closeness of energy is chosen. When none qualifies, the item keeps Claude's value. A nutrient the table does not report keeps Claude's value. Each item carries its source internally: label, database (with the food's id, name and table) or Claude's value. The screens do not show sources, ranges or confidence (owner, 2026-10-24); they stay in the data for tuning. No key and no network are needed for this step.
4. **Compute.** Totals, ranges and swap differences are plain arithmetic in `src/nutrition/math.ts` (grams × per-100 g ÷ 100), never asked of the model. Editing an item's grams recomputes everything instantly without another call.
5. **Refine.** Answering a follow-up question re-runs step 2 with the same image and the answer, then grounds again.
6. **Log.** The meal, or a chosen swap in its place, is saved to IndexedDB with its thumbnail.

Nutrients tracked: energy, protein, carbohydrate, fat, saturated fat, fibre, sugars, sodium. Energy shows in kJ (Australian default) or kcal (Philippine default); 1 kcal = 4.184 kJ.

How each table's nutrients are mapped and normalised (available carbohydrate, kJ to kcal, missing values) is in `docs/FOOD-DATA.md`.

## 5a. Targets and insights

Body details (sex, birth year, height, activity, optional body fat, pregnancy and breastfeeding) live in the profile; weight comes from the weigh-in log, one a day. When the details are complete and there is a weigh-in, `src/metabolism` sets the energy and protein targets ("Automatic" in Profile, on by default; turning it off keeps the current numbers as manual ones). It starts from Mifflin-St Jeor and an FAO activity level, then measures maintenance from the trend weight and finished logged days (today is left out), and reports insights: low intake, too-fast loss or gain, metabolic adaptation after a large loss, an incomplete log (measured burn under 1.2 x resting), plateaus and their causes, diet breaks, low protein, a new maintenance, slow progress, drift and an on-track note. Today shows the trend and the three most important insights, worded in `src/slices/body/words.ts` with no hedging. Under 18, pregnant, breastfeeding or implausible details: no automatic target, and a "Targets off" card says why. Planned deficits stop at 1% of body weight a week, 1,000 kcal a day and the 1,200/1,500 kcal floor. The science, every constant and its source are in `docs/METABOLISM.md`.

## 6. Data on the device

| Store | Key | Holds |
|---|---|---|
| localStorage | `nuance.profile` | goal, diet, foods to avoid, region, energy unit, daily targets, automatic targets on or off, pace, body details (sex, birth year, height, activity, body fat, pregnant, breastfeeding) |
| localStorage | `nuance.keys` | Claude key |
| localStorage | `nuance.prefs` | theme, reduce motion |
| localStorage | `nuance.usage` | per month: scans, follow-up refines and token counts (failed calls included) |
| IndexedDB `nuance` / `meals` | meal id | logged meals: time, dish, grounded items, totals, chosen swap, thumbnail |
| IndexedDB `nuance` / `weighins` | time | weigh-ins, one a day, in kg |

Day boundaries use the device's local time zone (tests run in Sydney and Manila).

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| A Claude key in browser storage can be read by anyone holding the unlocked phone, or by injected script | strict CSP (`script-src 'self'`, inline styles by hash only, `connect-src` from `network.json`, checked after every build by `scripts/verify-dist.mjs`); no third-party scripts; model text rendered as text only; the key field is write-only; one key per person with a monthly spend limit; a relay replaces direct calls before any public release |
| The web build shares the `macdarenz-droid.github.io` origin with the owner's other Pages sites (M/ARC), so a script there could read Nuance's storage or its offline cache | the Android app has its own origin; for the web build, the owner can move it to its own origin (a separate GitHub organisation's `<org>.github.io`, or a custom subdomain) |
| `main` deploys to every user | the owner adds a ruleset on `main` (pull request and the `check` job required, no force-push) and a required reviewer on the `github-pages` environment; workflows run with read-only tokens except the publish steps; actions are pinned to commit SHAs |
| Text in a photo picks the search names | names are cleaned to letters, digits and `, ( ) ' -`, at most 60 characters and 24 distinct lookups per scan; search runs on the device and nothing is sent anywhere |
| Body details and weights are health data | they stay on the device (localStorage and IndexedDB); "Erase all data" removes them; nothing about the body is sent to Claude |
| Photo portion estimates are approximate (hidden oil, sauces, depth) | follow-up questions; grams are editable; ranges and sources kept in the data |
| Filipino dishes are thin in the tables (FNRI PhilFCT's licence is not open) | FNDDS and AFCD aliases cover common ones (pandesal, adobo, lumpia); otherwise Claude's values stay |
| Automatic targets drive real eating | floors (1,200 kcal women, 1,500 men), rate caps (1% a week loss, 0.5% gain), no deficit when underweight, no target for under-18s or in pregnancy and breastfeeding; every rule is tested (`tests/metabolism.test.ts`) |
| A model or API change breaks parsing | schema-validated output, typed SDK errors, the stop reason checked before content; server-side refusal fallback (`fallbacks: "default"`) enabled |
| Cost per scan is not yet measured | token usage is recorded per call and shown in Profile; the first real-device runs set the baseline |
| iOS limits for home-screen apps (storage can be cleared after long disuse, no vibration API) | the log stays small; haptics degrade silently; export lands with accounts |

## 8. Offline and updates

The service worker (`src/sw.template.js`, filled in at build time) precaches the app shell, the Latin font subsets, the Claude client and the food tables (about 490 KB gzipped), so the app opens and grounds with no network; analysis itself needs one. Cached files are matched with `ignoreVary`, because hosts send `Vary: Origin` and module scripts are requested with an Origin header (without it the app failed to start offline in testing). A new build installs in the background and offers "Update ready · Reload".

## 9. Roadmap

1. **Now:** capture → breakdown → swaps → log, body details, weigh-ins, automatic targets and insights, profile, key, PWA install, Android APK.
2. **Next:** barcode lookup (Open Food Facts), recipe makeover from pasted text, cravings mode, swap feedback that tunes later suggestions.
3. **Later:** accounts and sync, a relay for keys, more regional food data, weekly patterns, Play Store and App Store builds.
