#!/usr/bin/env bash
# Agent guard: runs in CI on every push and before every agent push (.claude/hooks/guard-before-push.sh).
# Fails when a tracked file holds something that must never be committed.
set -uo pipefail
fail=0
say() { echo "Agent guard: $1" >&2; fail=1; }

# Claude API keys (sk-ant-...) in any tracked file.
if git grep -nIE 'sk-ant-[A-Za-z0-9_-]{16,}' -- . ':!.github/scripts/agent-guard.sh' >/dev/null 2>&1; then
  say "a Claude API key is committed. Remove it, then rotate the key in the Anthropic Console."
  git grep -nIE 'sk-ant-[A-Za-z0-9_-]{16,}' -- . ':!.github/scripts/agent-guard.sh' | cut -c1-120 >&2
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
