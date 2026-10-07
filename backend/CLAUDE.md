# backend

Express 5 + Prisma (SQLite) + Temporal (`@temporalio/client`/`worker`/`workflow`). Package
manager: pnpm (Corepack-pinned to `pnpm@9`, same reasoning as frontend).

## Commands

- `pnpm dev` / `pnpm start` — user-started (Express + Temporal worker); don't run unless
  explicitly asked
- `pnpm build` — `tsc -p .`
- `pnpm format` — Prettier (there is no `lint` script or ESLint config in this package —
  a real gap, tracked in `IMPROVEMENTS.md`, not something to silently bolt on mid-task)
- `pnpm test` / `pnpm test:watch` / `pnpm test:ui` / `pnpm test:coverage` — Vitest;
  `src/index.test.ts` is a real integration suite against an isolated SQLite DB (below),
  with Temporal mocked
- `pnpm gen:prisma` — safe, regenerates the Prisma client only, no schema/DB side effects
- `pnpm migrate:dev` — **do not run casually**, it mutates `prisma/dev.db`'s schema and
  migration history. Check `npx prisma migrate status` first (read-only); only actually run
  `migrate:dev` as part of a real schema change (e.g. task 3's new lead fields)

## Never touch `prisma/dev.db`

It's committed to git with sample data. Tests never touch it: `src/test/globalSetup.ts`
generates a throwaway `prisma/schema.test.prisma` (gitignored, same models, `url =
"file:./test.db"`) — needed because the real `schema.prisma` hardcodes `file:./dev.db` and
ignores `DATABASE_URL` — runs `prisma db push` against it before the suite, and deletes
schema+db+journal after. `vitest.config.ts` injects `DATABASE_URL` (via `test.env`) pointing
at that test DB, which `src/index.ts`'s `datasourceUrl` override on the `PrismaClient`
picks up. Unset, it falls back to the schema's literal `dev.db` path, so `pnpm dev`/`pnpm
start` are unaffected by any of this.

## Testing Temporal code

- `verifyEmailWorkflow` (`src/workflows/workflows.ts`) can't be exercised by calling
  `proxyActivities` outside a real Temporal workflow sandbox — tests mock
  `@temporalio/workflow` entirely rather than pulling in `@temporalio/testing`.
- `POST /leads/verify-emails` in `src/index.ts` talks to a real Temporal server at
  `localhost:7233` — tests mock `@temporalio/client`.
- `src/worker.ts` is excluded from coverage (`vitest.config.ts`) — pure connection
  bootstrap, same treatment as `main.tsx` in frontend.
- The 20s delay in `src/workflows/activities/utils.ts`'s `verifyEmail` (for `jane.smith`
  addresses — this, combined with the workflow's `startToCloseTimeout: '1 second'`, is bug
  2's root cause) is tested with `vi.useFakeTimers()` + `advanceTimersByTimeAsync`, never a
  real 20-second wait.

## Coverage

Baseline (`All files`, `pnpm test:coverage`): 100% statements, 93.4% branches, 100%
functions, 100% lines. Pinned as `coverage.thresholds` in `vitest.config.ts`. The uncovered
branches are generic DB/Temporal-failure `catch` blocks in `src/index.ts`, each marked
`/* v8 ignore start/stop */` with an inline reason — there's no cheap way to force
Prisma/Temporal to fail without mocking their internals, so they're deliberately excluded
rather than chased just to move the number.
