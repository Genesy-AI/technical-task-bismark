#!/bin/bash
# PreToolUse hook (matcher: Bash). Blocks `git commit` if either project's pinned coverage
# floor (frontend/vitest.config.ts or backend/vitest.config.ts `coverage.thresholds`) fails.
# Runs both projects unconditionally rather than trying to scope to "files staged for this
# commit" — PreToolUse fires before the tool call runs, so if `git add && git commit` was
# issued as one command, nothing is staged yet at hook time and per-project scoping would be
# wrong. See ../../AGENTS.md.
set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)

case "$cmd" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

root="${CLAUDE_PROJECT_DIR:-$PWD}"
log_file="$(mktemp)"
failed=""

if ! (cd "$root/frontend" && pnpm test:coverage -- --run) >"$log_file" 2>&1; then
  failed="frontend"
fi

if [ -z "$failed" ] && ! (cd "$root/backend" && pnpm test:coverage -- --run) >"$log_file" 2>&1; then
  failed="backend"
fi

if [ -n "$failed" ]; then
  tail_output="$(tail -c 2000 "$log_file")"
  reason="Coverage check failed for '$failed' (pnpm test:coverage) — blocking this commit. Fix the regression, or if coverage genuinely improved, raise the threshold in $failed/vitest.config.ts in the same change.

$tail_output"
  jq -n --arg reason "$reason" '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":$reason}}'
fi

rm -f "$log_file"
exit 0
