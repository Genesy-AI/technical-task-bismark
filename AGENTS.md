# technical-task-bismark — TinyEnginy take-home (Genesy AI)

A lead-management app used as a take-home technical assessment: React/Vite frontend +
Express/Prisma/Temporal backend. The README defines six independent tasks (2 bugs, 2
features, a PR review, a written analysis). Working notes and reasoning for each task live
in `WORKING_NOTES.md`, committed at the end as supporting evidence of process for reviewers
(see below). The actual deliverable analysis is `IMPROVEMENTS.md` (task 6).

Stack-specific commands and conventions live in [frontend/CLAUDE.md](frontend/CLAUDE.md) and
[backend/CLAUDE.md](backend/CLAUDE.md) — Claude Code loads whichever of those applies
automatically when you're working inside that folder, on top of this file.

## Working conventions

- **`WORKING_NOTES.md` is the working checklist and reasoning log for this session.** In a
  real project this would stay local-only; here it's committed too (near the very end, once
  everything else is settled) since this is a take-home evaluated partly on reasoning and
  trade-offs, not just the final diff. `IMPROVEMENTS.md` is still the actual
  README-requested deliverable — don't confuse the two.
- **One commit per fix/feature**, conventional-commit style (`fix:`, `feat:`, `test:`,
  `refactor:`, `chore:`, `style:`, `docs:`) — check `git log` for the exact style already in
  use on `chore/tinyenginy-take-home`.
- **Never update `WORKING_NOTES.md` or commit right after implementing a fix, even if
  build/lint/tests/coverage are all green.** Say the checks are green and stop — wait for the
  user to manually test the change themselves (e.g. in the running UI) and explicitly say
  it's good. Only then update `WORKING_NOTES.md` and commit. This is per fix/feature, every time —
  green CI is necessary but the user's own sign-off is the actual gate, not something to skip
  because the automated checks already look right.
- **Coverage only ever goes up, never down.** Both `frontend/vitest.config.ts` and
  `backend/vitest.config.ts` pin `coverage.thresholds` to the current baseline, so `pnpm
  test:coverage` fails outright on any regression. When you genuinely add coverage, raise
  the threshold to the new number in the same commit — never lower a threshold just to get
  a commit through.
- **`git commit` is gated.** `.claude/hooks/verify-before-commit.sh` (`PreToolUse` on
  `Bash`) runs `build`, `lint` (skipped where the script doesn't exist, e.g. backend), and
  `test:coverage` for both frontend and backend — unconditionally, not scoped to "what's
  staged," since the hook fires before the commit command actually runs — and denies the
  commit if any step fails.
- **Dev servers (`pnpm dev`, the Temporal worker) are started by the user, not by Claude** —
  don't run them unless explicitly asked.
- Don't touch `backend/prisma/dev.db` (committed sample data) from tests — see
  `backend/CLAUDE.md` for the isolated test-DB setup that keeps it untouched.
