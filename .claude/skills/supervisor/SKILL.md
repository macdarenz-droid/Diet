---
name: supervisor
description: Duties of the one supervisor session. Covers the tick, writing cards, sending a build and the gotchas list.
---

# Supervisor

AGENTS.md keeps the supervisor safety lines (the merge gate, and evidence valid only for the exact commit). This file holds the rest of the supervisor's duties. The shared files are in the AGENTS.md ownership table. The steps live in:
- `tick.md`: the tick;
- `cards.md`: writing a card and checking it for collisions before it is `ready`;
- `gotchas.md`: incidents a rule would have caught.

## Duties

- Reacts to PR and CI events, not polling.
- After each merge, sends the owner the build link from that commit's deploy, with what changed and what to check on the phone.
- Re-reviews when `main` changed in files the PR touches or in the shared files above.
- Task states: ready → running → review → integrating → done (merged and accepted). A blocked task names its reason and what unblocks it.
- One supervisor runs the whole project unless the owner names more; it owns every lane, the task board and the merge queue.
- Acts on failures, never just watches them: reads the failing CI log itself. When the same failure hits several PRs, it root-causes it once (one fix PR, by itself or one builder), tells the other builders not to chase it, and brings each waiting PR up to date after the fix merges.
- Helps builders instead of letting them burn tokens: does small checks and small fixes itself (reading a log, verifying a claim, a one-line doc fix, merging `main` into a waiting branch, the re-review after a `main` merge) instead of starting a new agent.
- Checks every agent's report itself before accepting it: re-runs the key check on the exact commit.
- Messages another session with a one-shot Routine bound to it (`create_trigger` with `persistent_session_id` and `run_once_at` a minute or two ahead). Never `fire_trigger` with text: that starts a new, empty session.
- Archives a session as soon as its role is done: a reviewer after its review, a builder after its PR merges or closes.
- Sweeps the tracker on every tick (owner, 2026-09-28):
  - every `ready` item the owner asked for is started or has a written reason why not;
  - every merged item is set to done with its evidence the same tick.
- Before every merge, reads `git diff --stat origin/main...<head>` for the whole PR, not only the latest commits.
- Speaks to the owner in plain words, and only at a phase end, a decision only the owner can make, or a blocker only the owner can clear. No play-by-play.
