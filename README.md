# Diet

Photo or text in; an itemised nutrition breakdown with honest ranges and healthier swaps out. A Progressive Web App for Android and iOS (add to home screen), built for Australia and the Philippines.

- System design: `docs/ARCHITECTURE.md`
- Visual and interaction language: `docs/DESIGN.md`
- Working rules for agents: `AGENTS.md` (copied from M/ARC and adapted)

## Run

```sh
npm ci
npm run dev          # local dev server
npm run check        # typecheck, tests, production build
npm run test:tz      # tests in Sydney and Manila time
npm run screens -- path/to/food.jpg   # every screen at phone size into screenshots/ (after a build)
```

## Keys

Each person adds their own keys in Profile. They are stored only in that browser.

- Claude API key: https://platform.claude.com/settings/keys
- USDA FoodData Central key (free): https://fdc.nal.usda.gov/api-key-signup/

Without a USDA key the app still works; values are then Claude's estimates and are labelled "Estimate".

## Host

Any static host works: build with `npm run build` and serve `dist/`. The repository is private, so GitHub Pages needs a paid plan or a public repository; Cloudflare Pages or Vercel can deploy a private repository from their dashboards (build command `npm run build`, output directory `dist`; check their current free-plan terms). Hosting is connected by the owner (AGENTS.md, "Only the owner").
