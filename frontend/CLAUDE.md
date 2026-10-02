# frontend

React 18 + Vite 7 + TanStack Query + Tailwind 4 + axios + papaparse + react-hot-toast.
Package manager: pnpm (Corepack-pinned to `pnpm@9`, matching `pnpm-lock.yaml`'s
`lockfileVersion: 9.0` — `corepack prepare pnpm@9 --activate` if `pnpm` resolves to a newer,
incompatible version).

## Commands

- `pnpm dev` — Vite dev server (user-started; don't run unless explicitly asked)
- `pnpm build` — `tsc -b && vite build`
- `pnpm lint` — ESLint, flat config (`eslint.config.js`, migrated from the legacy
  `.eslintrc.cjs` via `@eslint/eslintrc`'s `FlatCompat` to reuse the same rules)
- `pnpm format` — Prettier; no conflicting stylistic ESLint rules are enabled
- `pnpm test` / `pnpm test:watch` / `pnpm test:ui` / `pnpm test:coverage` — Vitest + Testing
  Library + jsdom

## Coverage

Baseline (`All files`, `pnpm test:coverage`): 99.73% statements, 97.68% branches, 92.72%
functions, 99.73% lines. Pinned as the `coverage.thresholds` floor in `vitest.config.ts` —
any regression fails the script (and the pre-commit hook, see root `AGENTS.md`).
`coverage.exclude` in the same file skips pure boilerplate with no real logic (`main.tsx`,
`*.d.ts`, `api/types/**`) and the dead-code file below, rather than writing meaningless tests
for them.

## Known dead code — do not delete yet

`src/api/mutations/useApiMutation.ts` has zero real consumers (confirmed by grepping
imports across `src/`). Removal is deferred until the end of the take-home, once it's
certain no remaining task needs it (see `WORKING_NOTES.md` / `IMPROVEMENTS.md`). It's also the only
reason two `dependencies` still exist: `lodash` and `ts-toolbelt` are used nowhere else. An
unused `TablerIcon` type alias in `globalTypes.d.ts` is the same situation for
`@tabler/icons-react`. Clean up all three together, not piecemeal.

## Conventions

- `endpoint()` in `src/api/utils.ts` uses TS overloads to vary the Input/Output type per
  HTTP verb — follow this pattern for any new API module instead of inventing a new one.
