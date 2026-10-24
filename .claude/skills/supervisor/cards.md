# Writing a card

## Hard cards (moved from AGENTS.md, 2026-09-29)

- Plan hard cards before building (owner, 2026-09-29). For complex work (animation production, simulation, anything with several possible designs), the supervisor first runs a phased plan: understand the problem, draft competing designs, have independent judges score them, then write the build cards. Builders on those cards write a short design note and post it on the PR as a progress check-in before bulk building; the supervisor reads it the next tick and re-guides or stops early. Small fixes stay simple, with no extra agents.

- For repeated families, validate a representative end-to-end slice and the highest-risk case before bulk production. Reuse approved patterns; isolate exceptions for their own checks rather than spreading an unproven pattern.

## Dependencies

- Keep `depends_on` for compatibility with the approved plan, and make its meaning explicit with `build_prerequisites` and `merge_prerequisites`. Name the shared-file owner alongside `write_scope` and `reserved_paths`; use the existing ownership rules.
- A merge-order-only dependency need not block build-ahead **only where the approved plan permits it** and the actual build prerequisites are met. Preserve explicit "no", "design note only", approval, shared-file and lane restrictions. An unclear dependency is clarified against the plan, not silently waived.
- State the deliverable, acceptance evidence and finish condition for the phase the card serves. Building a slice is distinct from accepting the integrated release candidate or publishing to a store.

## Collision check before a card is `ready`

Before a card is `ready`:
1. List what the card changes. Search the shared files (`tests/copy.test.ts`, `src/ui/styles.css`) and the `write_scope` of the other open cards for anything that pins or touches it.
2. If another task's block pins behaviour this card changes, name the block (task ID, file:line) in `read_first` and settle it now: the design avoids the change. Another task's block is never edited (AGENTS.md, file ownership). If the design cannot avoid it, the card stays `blocked`, with that block as its reason.

   A card with an unsettled collision is not `ready`.
3. Cards meant to run in parallel agree their shared names, data shapes and test IDs first, and write them into each card.
4. Cut work into vertical slices: each card is one small feature working end to end that can be checked on its own, not "the whole data layer first".
5. `model:` `claude-sonnet-5` only for mechanical cards (every step spelled out); `claude-opus-5-5` for everything else. The supervisor passes it when it starts the session.

Every card carries the fields listed in the builder skill, plus `model` (step 5).

A ruling during a build that changes drawn or pinned output repeats step 1 for that change before the builder goes on.
