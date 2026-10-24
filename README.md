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

## Key

Each person adds their own Claude API key in Profile (https://platform.claude.com/settings/keys). It is stored only on that device. Food data is bundled with the app, so no other key is needed.

## Host

GitHub Pages, published from `main` by `.github/workflows/pages.yml`: https://macdarenz-droid.github.io/Diet/. Repository Settings > Pages > Source must be set to "GitHub Actions" once. On a phone, open the link and choose Add to Home Screen.
