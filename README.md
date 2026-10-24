# Nuance

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

GitHub Pages, published from `main` by `.github/workflows/pages.yml`: https://macdarenz-droid.github.io/Diet/. Repository Settings > Pages > Source must be set to "GitHub Actions" once. On a phone, open the link and choose Add to Home Screen.
