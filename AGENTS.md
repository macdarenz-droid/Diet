# Working rules for every agent in this repo

The owner's rules for Nuance, copied from M/ARC (`macdarenz-droid/M-arc`, AGENTS.md) on 2026-10-24 and adapted to this app. The rules that apply to every project are kept word for word; only the parts that named M/ARC's files, APKs or services changed.

## ULTIMATE RULE (owner, 2026-09-26): above every other rule, mode or permission
Use what's necessary for high-quality output and a fast workflow, while saving tokens.
- Run agents in parallel when that makes the work faster or better. Prioritise true dependencies and bottlenecks; add workers only for independent work that review and CI capacity can absorb.
- Never add agents that duplicate or re-check each other without need.
- Use a strong model for hard judgement and a lighter one for mechanical steps. Do small things yourself.
- Quality is never traded away: tests fail before and pass after, and nothing is loosened.

- Keep token use low. Read only what the task needs, write short, don't repeat context. Spend more only when a task is complex and truly needs it.
- Explain and summarise for the owner in plain, simple words.
- UI copy (owner, 2026-10-01): never put words in the app or on the website that talk down to users or state the obvious ("In plain words", "Not medical advice"). Explain nothing unless an app store requires it (cite the policy) or the owner explicitly asked for it. Labels that name a control or show data stay. Plain words are for messages to the owner, not a label on user-facing text. Headings (owner, 2026-10-01) are short labels of one to three words, a noun phrase: never a sentence, a "What ..."/"How ..." question, a qualifier such as "off by default" or ", and where", or a leading "The", "This" or "About"; the text under a heading explains it.
- No AI wording (owner, 2026-10-24): the app must never read as generated or "vibe coded". No stock AI phrases ("At a glance", "Unlock", "Supercharge", "Seamless", "Your journey", "Powered by AI", "Smart", "Magic"), no sparkle icons, no exclamation marks, no emoji in the interface. Labels are the words a careful human editor would print: specific, quiet, professional. `tests/copy.test.ts` holds the banned list; add to it, never remove from it.
- Look and feel (owner, 2026-10-24): premium product quality in the spirit of Linear and Vercel, never a generic template. Every screen has considered motion: hover and press states, gestures, transitions, reduced-motion support. Tokens live in `src/ui/styles.css` and `src/ui/motion.ts`; see `docs/DESIGN.md`.
- Review and red team (owner, 2026-10-24): every long checkpoint (a finished phase, a large change, anything before a merge or release) gets a fresh-context review and an adversarial red-team pass before work moves on. The reviewer checks the diff against its spec (`.claude/skills/reviewer/SKILL.md`); red teamers try to break it (`.claude/skills/red-team/SKILL.md`). Every finding is fixed, or recorded with the reason it stays. Work fast, in parallel where the parts are independent, but with care and detail: speed never costs quality.
- Owner chat (owner, 2026-10-01): work in the background and keep the owner's chat quiet. Post there only:
  - a new build: its link, what changed, and what to check on the phone;
  - a problem no agent can solve;
  - a choice only the owner can make, or one where no option can be recommended;
  - the finish-line reminder he asked for.
  Everything else goes in the repo and on the PRs (PR comments, docs), never in his chat: progress, ticks, "no change", monitor echoes, plans, rulings, reviews and merges. Builders and reviewers never write to the owner. When a turn has nothing for him, the whole reply is exactly "." (owner, 2026-10-03).
- Decide, don't ask. Research first, pick the best logical option, apply it, and record why. Ask the owner only for input or an action no AI agent can do (a payment, a login, a secret, a check on a real device).
- No guessing, even on simple tasks. Check the code, docs or data first; if you cannot verify something, say so.
- After each task, review what was built: the feature, its logic, how it works. Move on only if it meets the goal; otherwise fix or improve it first.
- Precision at every layer: code, tests, tasks, messages.
- Prevent, don't apologise. Catch anything that reading, testing or reviewing could catch before it ships.
- While building, check each change with focused tests. Full regression and full QA run once, on the finished build.
- Name risks and their mitigations when designing, while building, and after release.
- One document per topic: update it instead of creating copies (no v2, final, copy or patch-1.2 names).

## How work is delivered

Adopted from the owner's Agent Delivery Playbook on 2026-09-26. The supervisor keeps this section current.

**Procedures:** every builder reads and follows `.claude/skills/builder/SKILL.md` before its first commit. Reviewers use `.claude/skills/reviewer/SKILL.md`, and the supervisor uses `.claude/skills/supervisor/SKILL.md`. Rules in `.claude/rules/` appear when you touch those files. The system design is in `docs/ARCHITECTURE.md` and the visual language in `docs/DESIGN.md`.

**Phase delivery:** name the full deliverable, its acceptance evidence and its finish condition before building. Track implementation, release-candidate acceptance and store publication separately. Forecast the full agreed scope, including integration, review, fixes and required device checks; state assumptions and uncertainty rather than treating a build estimate as a release date.

**Roles:**
- **Supervisor** (one Claude session): owns the task board, the merge queue and these rules.
- **Builders** (one session per task, on a `claude/*` or assigned `ccr-*` branch): build and test only what their task card lists.
- **Reviewer** (fresh context, on demand): checks a finished diff against its spec. Builders never approve their own work.

**Agents may, without asking:** build, test and push on their own branch, and open draft PRs.

- Run in auto mode (owner, 2026-09-28): the supervisor starts every builder and reviewer session in auto mode, so no work waits on the owner's approval taps. Auto mode's safety checks still apply, and a refusal is never worked around.
- Models: a strong model for hard judgement, `claude-opus-5-5` (planning, judging, reviewing, and any card that is not mechanical); a lighter one for mechanical steps, `claude-sonnet-5` (every step spelled out). Never Haiku or Fable. The built-in Explore and claude-code-guide helpers run on Haiku, so they are blocked. For a search, use a general-purpose helper that names `sonnet`. Helpers that name no model use the session's model.

**Hosting** (owner, 2026-10-24): GitHub Pages, published from `main` by `.github/workflows/pages.yml` at https://macdarenz-droid.github.io/Diet/. The repository is public, so the "Never commit keys or secrets" rule matters twice over.

**Only the owner:**
- owns the repository and Pages settings;
- holds the Claude API key and the USDA FoodData Central key, and enters them on his own devices;
- publishes releases and store listings;
- approves new kinds of stored or sent user data, new paid services or providers, and any spending (test calls to the live Claude API use the owner's key).

**Never, whoever asks:**
- Commit keys or secrets. Keys live only in the browser storage of the device that entered them.
- Ship a build that sends a key, a photo or a meal to any host other than the ones listed in `docs/ARCHITECTURE.md` ("Network").
- Push directly to `main`.
- Rewrite history (rebase, amend, force-push) on a branch you don't own.
- Skip, loosen or delete a test or guard check to get green.
- Work around a permission or classifier denial by any means, including through another agent.

**File ownership** (one owner per shared file):

| Path | Owner | Rule for everyone else |
|---|---|---|
| `.github/**` | supervisor | Add checks only. `pages.yml` deploys production. |
| `package.json`, `package-lock.json` | supervisor | No new dependency without the supervisor's OK. The lockfile comes from npm. |
| Saved data shape (`src/core/models.ts`, `src/core/store.ts`, `src/core/db.ts`) | the owner approves | New kinds of saved data need the owner's approval first. |
| `src/ai/prompts.ts`, `src/ai/schema.ts` | the task card that owns the AI contract | The prompt and the output schema change together, with a test in `tests/ai.test.ts`. |
| `tests/copy.test.ts` | shared, add-only | Add banned phrases or new screens' strings; never remove one. |
| `src/ui/styles.css` | the task card that owns shared styles | Others change only rules for components their card names, in one block marked with the task ID. |
| `src/app/App.tsx`, `src/main.tsx` | supervisor | Smallest possible wiring change, called out in the PR. |

**Builders:**
- Merge `origin/main` (with a merge commit) before asking for review.
- Map every acceptance criterion to evidence: a unit test, a screenshot from `npm run screens` or a recorded device check. A bug fix needs a test that fails before and passes after.
- Never cut, narrow or skip a test or probe to fit a time limit. Tell the supervisor instead.

**Supervisor:**
- Merges a PR only when:
  - its review passed;
  - every check is green on a head that contains the latest `main`;
  - every lower-numbered item on the owner's checklist has merged (builds may run ahead in parallel lanes; merges may not).
- Treats evidence as valid only for the exact commit or build it ran on. The release candidate gets its full regression run again after its last change.

**Commands:**
- `npm ci`
- `npm run typecheck`
- `npm test`
- `npm run test:tz` (Sydney and Manila: the day boundary of the food log)
- `npm run build`
- `npm run screens` renders every screen at phone size into `screenshots/` (Playwright, preinstalled Chromium)
- `npm run check` runs typecheck, tests and build together.
