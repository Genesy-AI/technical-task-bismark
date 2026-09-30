#!/bin/bash
# PostToolUse hook (matcher: Write|Edit). Auto-formats the file just touched with whichever
# project's own Prettier applies (frontend/backend each manage their own pnpm deps/config).
set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_response.filePath // .tool_input.file_path // empty' 2>/dev/null)

[ -z "$file" ] && exit 0

case "$file" in
  *node_modules*|*/dist/*|*/coverage/*) exit 0 ;;
esac

root="${CLAUDE_PROJECT_DIR:-$PWD}"

case "$file" in
  "$root"/frontend/*) project="frontend" ;;
  "$root"/backend/*) project="backend" ;;
  *) exit 0 ;;
esac

case "$file" in
  *.ts | *.tsx | *.js | *.jsx | *.json | *.css | *.md) ;;
  *) exit 0 ;;
esac

(cd "$root/$project" && npx prettier --write "$file") >/dev/null 2>&1 || true
exit 0
