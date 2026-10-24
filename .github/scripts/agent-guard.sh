#!/usr/bin/env bash
# Agent guard: runs in CI on every push and before every agent push (.claude/hooks/guard-before-push.sh).
# Fails when something that must never be committed is in the tree, or was added by any commit on
# this branch that main does not have (a key committed and then deleted is still public).
set -uo pipefail
fail=0
say() { echo "Agent guard: $1" >&2; fail=1; }

# Claude keys, api.data.gov (USDA) keys in URLs, private key blocks.
SECRET='sk-ant-[A-Za-z0-9_-]{16,}|api_key=[A-Za-z0-9]{40}|-----BEGIN [A-Z ]*PRIVATE KEY-----'

if git grep -nIE "$SECRET" -- . ':!.github/scripts/agent-guard.sh' >/dev/null 2>&1; then
  say "a secret is committed. Remove it, then rotate it (Anthropic Console or api.data.gov)."
  git grep -nIE "$SECRET" -- . ':!.github/scripts/agent-guard.sh' | cut -c1-120 >&2
fi

# Every commit on this branch that main lacks. CI checks out full history (fetch-depth: 0); without
# a main to compare with (a shallow clone), only the tree above is checked, and this says so.
if git rev-parse -q --verify origin/main >/dev/null; then
  if git log -p origin/main..HEAD -- . ':!.github/scripts/agent-guard.sh' | grep -E '^\+' | grep -E "$SECRET" >/dev/null; then
    say "a commit on this branch added a secret, even if a later commit removed it. Rotate it; history keeps it."
  fi
else
  echo "Agent guard: origin/main not available; branch history not scanned." >&2
fi

# Env files and anything under node_modules (a symlink counts).
if git ls-files | grep -E '(^|/)\.env($|\.)|(^|/)node_modules($|/)' >/dev/null; then
  say "an .env file or node_modules is tracked."
  git ls-files | grep -E '(^|/)\.env($|\.)|(^|/)node_modules($|/)' >&2
fi
# Signing keys and built apps.
if git ls-files | grep -E '\.(keystore|jks|p12|apk|aab)$' >/dev/null; then
  say "a keystore or a built app is tracked."
  git ls-files | grep -E '\.(keystore|jks|p12|apk|aab)$' >&2
fi
[ "$fail" = 0 ] && echo "Agent guard: passed"
exit "$fail"
