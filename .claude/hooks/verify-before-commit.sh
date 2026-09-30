#!/bin/bash
# PreToolUse hook (matcher: Bash). Blocks `git commit` if either project's build, lint (when
# the script exists — backend has none), or pinned coverage floor fails. Runs both projects
# unconditionally rather than trying to scope to "files staged for this commit" — PreToolUse
# fires before the tool call runs, so if `git add && git commit` was issued as one command,
# nothing is staged yet at hook time and per-project scoping would be wrong. See ../../AGENTS.md.
set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)

case "$cmd" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

root="${CLAUDE_PROJECT_DIR:-$PWD}"
log_file="$(mktemp)"
failed_project=""
failed_step=""

has_script() {
  jq -e --arg n "$2" '.scripts[$n] != null' "$1/package.json" >/dev/null 2>&1
}

run_step() {
  local project="$1" script="$2"
  shift 2
  has_script "$root/$project" "$script" || return 0
  if [ "$#" -gt 0 ]; then
    (cd "$root/$project" && pnpm run "$script" -- "$@") >"$log_file" 2>&1
  else
    (cd "$root/$project" && pnpm run "$script") >"$log_file" 2>&1
  fi
}

check_project() {
  local project="$1"
  for step in build lint; do
    if ! run_step "$project" "$step"; then
      failed_project="$project"
      failed_step="$step"
      return 1
    fi
  done
  if ! run_step "$project" test:coverage --run; then
    failed_project="$project"
    failed_step="test:coverage"
    return 1
  fi
  return 0
}

check_project frontend
if [ -z "$failed_project" ]; then
  check_project backend
fi

if [ -n "$failed_project" ]; then
  tail_output="$(tail -c 2000 "$log_file")"
  reason="'$failed_project' failed \`pnpm $failed_step\` — blocking this commit. Fix it, or if this was a deliberate coverage threshold change, make sure it's raised (never lowered) in the same commit.

$tail_output"
  jq -n --arg reason "$reason" '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":$reason}}'
fi

rm -f "$log_file"
exit 0
