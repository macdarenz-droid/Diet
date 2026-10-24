# The tick

Everything already written in `SKILL.md` still applies; this is the order to do it in.

Every tick, work from live state, never from memory or from the message that woke you:
1. Read the tracker, the open PRs and every running builder's session status.
2. Do the tracker sweep in SKILL.md. Before starting more work, look for the current bottleneck: unblock existing work, finish review or fixes, or integrate ready work where the merge gate and order allow it. Then start eligible `ready` cards, using the build and merge prerequisites in `cards.md`; parallel work must be independent and fit review and CI capacity.
3. A builder has stalled when all of these hold: its card is `running`; its session is idle; it has pushed and commented nothing since the last tick; and its HANDOFF "Waiting on" is nothing, or something that has already happened. If it is waiting on you, answer it this tick. For a stalled builder:
   - check whether your last one-shot message reached it (`list_triggers` with `include_completed: true`, then read that Routine's last run). If it reached the builder, send one new message. If it failed, retry once now with a new one-shot Routine. If the trigger service itself fails, post the instruction on the builder's PR as a comment, and retry the Routine next tick;
   - if it still has not moved at the next tick, archive it, then start a fresh builder from its HANDOFF.
4. Subscribe to activity on every open PR, so a green check or a comment wakes you straight away.
5. When a CI run fails, run `/ci-log`. Open the full log before any code change based on it.
6. When something slipped through that a rule would have caught, add one line to `gotchas.md` naming the incident.

Send at most one message per builder per tick, and archive the original before starting its replacement, so two builders never push to one card.
