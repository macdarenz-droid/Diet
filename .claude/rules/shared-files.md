---
paths:
  - "tests/copy.test.ts"
  - "src/ui/styles.css"
---

# Shared files: add your own block only

You are touching a shared file. The rules for it are in the file ownership table in AGENTS.md.

- Put your change in your own block, named with your task ID. In `src/ui/styles.css`, change only the rules for components your card names.
- `tests/copy.test.ts` is add-only: add banned phrases or new strings to check; never remove one.
- When you merge `main`, keep both sides of every conflict in these files.
- If another task's block pins behaviour your card changes (a test now fails because of your change), stop. Do not edit that block. Post on your PR which block it is (task ID, file:line) and what your change does to it, then wait for the supervisor.
