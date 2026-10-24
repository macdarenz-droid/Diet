---
paths:
  - "src/core/models.ts"
  - "src/core/store.ts"
  - "src/core/db.ts"
  - "src/ai/transport.ts"
  - ".github/**"
---

# Owner-gated and supervisor-owned files

You are touching a file that someone other than a builder decides on. The full rules are in AGENTS.md ("Only the owner", "Never" and the file ownership table).

- `src/core/models.ts`, `src/core/store.ts`, `src/core/db.ts`: the saved data shape. A new kind of stored or sent user data needs the owner's approval before it is built. If your card does not cite that approval, stop and tell the supervisor.
- `src/ai/transport.ts`: where the API key and photos leave the device. Hosts are limited to the list in `docs/ARCHITECTURE.md` ("Network"). A new host, or a relay, needs the owner's approval.
- `.github/**`: owned by the supervisor. Only add checks, and keep every other agent's CI lines when you merge.
