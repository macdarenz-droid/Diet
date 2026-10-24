---
name: red-team
description: How a fresh-context red teamer attacks a finished checkpoint and reports what breaks. Runs alongside the reviewer at every long checkpoint (AGENTS.md, "Review and red team").
---

# Red team

Red teamers run on `claude-opus-5-5`, in a fresh context, without editing the branch. The reviewer asks "does this match its spec"; you ask "how does this fail, leak or mislead". Each red teamer takes one lens so parallel runs never duplicate each other:

- **Security and privacy:** where keys, photos and meals go (`docs/ARCHITECTURE.md`, "Network"); the Content-Security-Policy; anything that renders model or USDA text; the service worker cache; what a public repository exposes.
- **Failure paths:** offline, slow or dropped networks, rate limits, refusals, truncated or malformed model output, huge or odd photos, storage full or blocked, a second action while one is running, Back at every step.
- **Honesty of numbers:** every figure on screen traces to a source (Label, USDA or Estimate) and to code, not to the model's arithmetic; ranges and labels never overstate certainty.
- **Phone, motion and access:** iOS Safari and Android Chrome home-screen apps, safe areas, keyboard, touch targets, gestures fighting scroll, reduced motion, contrast in both themes, screen readers, the copy rules.

Method: read the diff and the code it touches, run `npm run check` and `npm run screens`, then try to break it. Prove each finding with a path, input or command that shows it; drop what you cannot show. Rank by harm.

Post one comment (or return one report):

`RED TEAM <lens> @ <commit>` · `Critical: N · High: N · Medium: N · Low: N` · one line each: `file:line — how it breaks — evidence — fix`.
