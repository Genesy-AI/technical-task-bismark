# TinyEnginy — Take-home checklist

Working document used to track progress and record the reasoning behind each decision
(useful to explain to reviewers afterwards). Not a deliverable requested by the README (that's
`IMPROVEMENTS.md`) — this is our internal tracker/reasoning log.

## Strategy

1. **Phase 0 — Environment stabilization.** Before touching any bug/feature, we built a
   test + coverage safety net over the code's **current** behavior (no fixes yet). This gives
   a baseline to measure regressions against while we work, and helps understand how the
   project is built by reading/testing its real behavior.
2. **Phase 1 onward — fix by fix, feature by feature.** Each bug/feature is implemented
   separately, with its own tests, verified in the UI, and committed in isolation.

## Phase 0: Environment stabilization

- [x] Install missing tooling: `@vitest/coverage-v8` (frontend + backend), `@testing-library/react` (frontend)
- [x] Configure `coverage.exclude` in `frontend/vitest.config.ts` (boilerplate with no logic: `main.tsx`, pure types in `api/types/**`, `useApiMutation.ts` since it's dead code)
- [x] Write tests over the current (pre-fix) behavior of: `csvParser.ts`, `api/utils.ts`, `api/modules/leads.ts`, `api/index.ts`, `axios.ts`, `Providers.tsx`, `App.tsx`, `LeadsList.tsx`, `CsvImportModal.tsx`, `MessageTemplateModal.tsx`
- [x] Frontend: coverage went from 7.81% → 99.71% (80 tests). 2 lines remain intentionally uncovered (duplicate defensive guards already covered by a `disabled` on the button, in `CsvImportModal.tsx` and `LeadsList.tsx`) — not worth testing unreachable code, better candidate to simplify in the roadmap
- [x] Backend: raise coverage (see "Backend — raising coverage" section below)
- [x] Commit for this phase (`ec80a84` test(frontend): add coverage tooling and baseline tests)
- [x] Ran every script in `frontend/package.json` (`lint`, `build`, `test`, `test:coverage`) — found 2 pre-existing bugs, neither introduced by us:
  - [x] `pnpm build` was failing: `useApiMutation.ts` didn't satisfy the `Lead` type (missing `emailVerified`) → commit `f07c69f`
  - [x] `pnpm lint` was failing: ESLint 9.34 installed with a legacy `.eslintrc.cjs` config (v8 format) → migrated to `eslint.config.js` (flat config) via `FlatCompat`, plus 24 pre-existing `no-explicit-any` warnings silenced inline (legitimate generic plumbing) → commit `f84a032`
  - [x] `pnpm format` (Prettier) verified with no conflict against the new ESLint config (no style rules active in `eslint.config.js`) → run across the whole repo, only `LeadsList.tsx` affected (279 lines, pure formatting, had never been run through Prettier) → commit `5281a89`
  - [x] Final check of the 4 scripts in order `format` → `lint` → `test` → `build`: all green (80 tests, build ok)
- [x] Dependency audit for `frontend/package.json` (see "Dependency audit — frontend" section below)
- [x] Ran every script in `backend/package.json` (skipping `start`/`dev`, which boot a server, and `migrate:dev`, which mutates the DB schema — see note below):
  - [x] `pnpm build` (`tsc -p .`) → no errors
  - [x] `pnpm format` (Prettier) → 3 previously-unformatted files: `workflows/index.ts`, `workflows/activities/index.ts`, `workflows/activities/utils.ts` (indentation/semicolons/trailing newline, pure style, same pattern as `LeadsList.tsx` in frontend)
  - [x] `pnpm test` → 24 tests (only `messageGenerator.ts` has tests today; `index.ts`, `worker.ts`, `workflows/*` at 0%, pending coverage work)
  - [x] `pnpm test:coverage` → missing `@vitest/coverage-v8` in devDependencies (same situation as frontend, though it was already present in `node_modules` from a previous undeclared install) → added, pinned to `3.2.4`
  - [x] `pnpm gen:prisma` → regenerates the client without touching the schema/DB, no issue
  - [x] `migrate:dev` was NOT run (it would mutate `dev.db`'s schema/migration history) — instead ran `npx prisma migrate status` (read-only): schema up to date, 4 migrations, nothing pending. Would be run for real once feature 3 (new lead fields) came up
  - [x] Noted (not a bug, a roadmap finding): backend has no ESLint configured and no `lint` script, unlike frontend
- [x] Repeated the dependency audit for `backend/package.json` (see "Dependency audit — backend" section below)

### Backend — raising coverage

Backend is harder to test than frontend: `index.ts` (Express routes) talks to the real `dev.db` via Prisma and didn't export `app` or allow pointing at another DB; the workflows are Temporal (real delays, need their own test environment). Decision: **isolated test DB + supertest + fake timers**, without installing `@temporalio/testing` (mocking `@temporalio/workflow`/`@temporalio/client` directly instead, lighter-weight for the scope of this take-home).

- [x] **Minimal testability refactor in `index.ts`** (a production code change, not just tests, done as a deliberate prior step):
  - `prisma` now accepts a `datasourceUrl` override via `process.env.DATABASE_URL` (if unset, falls back to the schema's literal `file:./dev.db` — zero behavior change for normal `pnpm dev`/`pnpm start`)
  - `app` is now exported
  - `app.listen(...)` and `runTemporalWorker()` are now gated behind `if (process.env.NODE_ENV !== 'test')` (Vitest sets `NODE_ENV=test` automatically) — so importing the module in tests doesn't start a real server or a real Temporal worker
- [x] **Isolated test DB, without touching `prisma/dev.db`** (which is committed to git with sample data): `prisma/schema.prisma` has the `url` hardcoded (not via `env()`), so the Prisma CLI ignores `DATABASE_URL`. Solution: `src/test/globalSetup.ts` generates a temporary schema (`prisma/schema.test.prisma`, gitignored) with the same model but `url = "file:./test.db"`, runs `prisma db push` against that schema before the tests, and deletes schema+db+journal afterwards. `vitest.config.ts` injects `DATABASE_URL` (via `test.env`) pointing at that `test.db` so `index.ts`'s `datasourceUrl` override picks it up
- [x] Tests written:
  - `src/workflows/activities/utils.test.ts`: `verifyEmail` with the john.doe/plus-sign/valid cases + jane.smith's 20s delay covered via `vi.useFakeTimers()` + `advanceTimersByTimeAsync` (no real waiting)
  - `src/workflows/workflows.test.ts`: mocks `@temporalio/workflow`'s `proxyActivities` (can't be invoked outside a real Temporal workflow) to verify `verifyEmailWorkflow` uses it with `startToCloseTimeout: '1 second'` and delegates correctly — this same `'1 second'` is the root cause of bug 2, already diagnosed at this point
  - `src/index.test.ts`: real integration tests with supertest against the test DB (every route: `/leads` CRUD, bulk import, generate-messages, verify-emails with `@temporalio/client` mocked). Includes a test that explicitly documents the current (pre-fix) behavior of `countryCode` in `/leads/bulk`: saves "XXX" as-is, no validation — a baseline to avoid regressing while bug 1's fix is implemented
  - `src/worker.ts` is **excluded from coverage** (`vitest.config.ts` → `coverage.exclude`), pure connection bootstrap, same treatment as `main.tsx` in frontend
- [x] Final coverage: **100% statements/lines, 91.78% branches** in `src/index.ts` (100% everywhere else). The uncovered branches are generic "unexpected DB/Temporal failure" `catch` blocks (5 in `index.ts`) plus the real bootstrap block (`app.listen`/`runTemporalWorker`, already covered by the `NODE_ENV` guard) — all marked with `/* v8 ignore start/stop */` comments with the reason inline, instead of mocking Prisma at a low level just to inflate the number
- [x] Side findings for `IMPROVEMENTS.md` (not touched now, out of scope for the 6 tasks):
  - [ ] `POST /leads` and `PATCH /leads/:id` read `req.body.name`, not `firstName` — inconsistent with the rest of the API (bulk import, frontend), which uses `firstName`. Potentially a real bug if anything calls these endpoints with `firstName`
  - [ ] The generic `catch` blocks in `index.ts` (500 "failed to X") don't have easy-to-write tests because there's no way to force Prisma to fail without mocking its internals — a signal that catching generic infrastructure errors this way, without a real logger/observability, is hard to verify; candidate to revisit in the roadmap

### Dependency audit — backend

- **`dependencies`**: all 5 (`@prisma/client`, `@temporalio/client`, `@temporalio/worker`, `@temporalio/workflow`, `express`) confirmed in real use via `grep` of imports in `src/`. No findings.
- **`devDependencies`**: all in use — `typescript`/`prettier`/`prisma`/`@vitest/ui`/`vitest` (scripts), `@vitest/coverage-v8` (just added, see above), `@types/express`/`@types/node` (typings), `ts-node` (implicit engine used by `nodemon` to run `.ts` in the `dev` script — no direct import in code, but real usage via nodemon). No orphans.
- **Conclusion**: unlike the frontend, the backend has no orphan dependencies and none tied to dead code.

### Dependency audit — frontend

Methodology: `grep` each package in `dependencies`/`devDependencies` against real imports in `src/`. For devDependencies (tooling), usage was verified in config files (`vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, etc.) instead of imports in `src/`.

- **`dependencies` with findings:**
  - [ ] `@tabler/icons-react`: **no real usage**. Only appears in `globalTypes.d.ts:5` inside a type alias (`TablerIcon = typeof import('@tabler/icons-react').IconX`) which itself has no consumers in the code. Candidate for removal from `package.json` (along with the `TablerIcon` alias, if confirmed nobody needs it).
  - [ ] `lodash` and `ts-toolbelt`: only used inside `useApiMutation.ts`, which we already identified as dead code (no consumers). If that file is removed at the end of the project, these two dependencies should also come out of `package.json`.
  - Remaining `dependencies` (`@tanstack/react-query`, `@tanstack/react-query-devtools`, `axios`, `papaparse`, `react`, `react-dom`, `react-hot-toast`): usage confirmed across multiple files in `src/`, no action needed.
- **`devDependencies`**: all confirmed in use — `tailwindcss`/`@tailwindcss/vite` (plugin in `vite.config.ts` + `@import` in `index.css`), `@vitejs/plugin-react-swc` (`vite.config.ts`), `vitest`/`jsdom`/`@vitest/coverage-v8`/`@vitest/ui` (`vitest.config.ts`), `@testing-library/react`/`@testing-library/jest-dom` (tests + `src/test/setup.ts`), `eslint`/`@typescript-eslint/*`/`eslint-plugin-*`/`@eslint/js`/`@eslint/eslintrc` (`eslint.config.js`), `prettier`, `typescript`, `@types/*` (typings for their runtime-equivalent packages). No findings.
- **Conclusion**: no orphan devDependencies; there are 3 runtime dependencies whose only reason to be in `package.json` is dead code or a type alias with no consumers (`@tabler/icons-react`, `lodash`, `ts-toolbelt`). Documented in `IMPROVEMENTS.md` together with the `useApiMutation.ts` decision, to be resolved together at the end (not touching `package.json` yet to avoid mixing it with bug fixes).

## Phase 0.5: Claude Code tooling (AGENTS.md/CLAUDE.md + hooks)

Before continuing with the fixes, we set up infrastructure so Claude Code itself follows this session's conventions without having to repeat them every time, inspired by the pattern in `/Users/bismark.henao/projects/opis/mcp-tools` (CLAUDE.md as a one-line `@AGENTS.md` + per-folder rules).

- [x] `AGENTS.md` (root, real content) + `CLAUDE.md` (root, `@AGENTS.md`): cross-cutting conventions — `WORKING_NOTES.md` is never committed, one commit per fix/feature, "coverage only ever goes up" → commit `2960b06`
- [x] `frontend/CLAUDE.md` and `backend/CLAUDE.md`: stack-specific commands and conventions (coverage baseline, deferred dead code, how Temporal is tested, don't touch `dev.db`) — Claude Code loads whichever applies automatically depending on which folder is active, on top of root → same commit `2960b06`
- [x] `coverage.thresholds` pinned in both `vitest.config.ts` files to exactly today's baseline (frontend 99.73/97.68/92.72/99.73, backend 100/93.4/100/100 stmt/branch/func/line) — verified `pnpm test:coverage` fails if the threshold is raised above the real number (tested by hand, bumping a decimal and confirming `ERROR: Coverage ... does not meet global threshold`) → commit `abb8635`
- [x] `.claude/settings.json` + `.claude/hooks/`:
  - `check-coverage-before-commit.sh` (`PreToolUse`, matcher `Bash`): if the command contains `git commit`, runs `pnpm test:coverage -- --run` in both frontend AND backend (without trying to scope to "what's staged for this commit" — the hook runs *before* the command executes, so if `git add && git commit` is a single call, nothing is staged yet at that point; always running both is simpler and more correct). Denies the commit with the reason and the log tail if either fails
  - `format-on-write.sh` (`PostToolUse`, matcher `Write|Edit`): formats the just-touched file with the matching project's Prettier (frontend or backend, based on path)
  - Both tested by hand before being trusted: a non-commit command (silent), a commit with green coverage (silent, ~3.7s), a commit with a threshold deliberately broken (denies with the correct reason), and a badly-formatted `.ts` file that the hook actually reformats
  - Confirmed live: the 3 commits in this phase went through the coverage hook itself with no false positives → commit `de0c917`

## 1. Bug: CSV import shows invalid country codes

- [x] Reproduced the bug (imported `leads-with-errors.csv`, saw `"12"` and `"XXX"` in the Country column)
- [x] Diagnosed root cause: `countryCode` isn't validated anywhere in the flow
  - `frontend/src/utils/csvParser.ts:70-72`
  - `backend/src/index.ts:230` (`POST /leads/bulk`)
- [x] Design decision confirmed with the user (`AskUserQuestion`): an invalid countryCode gets **cleared** (undefined/null), the row **isn't blocked** (stays "Valid" if the rest of the fields are fine), and it's surfaced as a visible **non-blocking warning**, separate from `errors`
- [x] `isValidCountryCode` (regex `/^[A-Za-z]{2}$/`) implemented on both sides, each with its own unit tests:
  - `frontend/src/utils/csvParser.ts` — exported, used inside `parseCsv`; adds `warnings: string[]` to `CsvLead` and uppercases when valid
  - `backend/src/utils/countryCode.ts` (new) — used inside `POST /leads/bulk`; the response now includes `warnings: Array<{ lead, warning }>` alongside `errors`
- [x] Unit tests: `csvParser.test.ts` (+7 cases), `countryCode.test.ts` (new, 4 cases), `index.test.ts` (replaced the test documenting the bug with 3 tests for the fix: clears XXX with a warning, clears "12", normalizes "us"→"US" with no warning)
- [x] UI: `CsvImportModal.tsx` — new "Warnings" column in the preview (amber, separate from "Errors" in red) + a "With Warnings" tile in the summary + the success toast mentions how many leads had their country code cleared. Tests updated/added in `CsvImportModal.test.tsx`
- [x] Coverage: went up in both projects after the fix (frontend 99.73→99.74% stmts, backend branches 93.4→93.68%) — thresholds in `vitest.config.ts` updated in the same change
- [x] Verified in the UI by the user: the preview shows the warning coexisting with another real error (Gabrielle's row: "Last name is required" + the `XXX` warning), and after importing, Amanda James/Latasha Martin (who had "12"/"XXX") show "-" in Country in the main list — bug confirmed fixed
- [x] Committed (`7a0625f` fix: sanitize invalid CSV/bulk-import country codes instead of showing them raw)

## 2. Bug: email verification hangs with no feedback

- [x] Reproduced live before touching any code: CSV with a `jane.smith@example.com` lead (the `verifyEmail` activity simulates a 20s delay for that domain), clicking "Verify Email" → the Temporal Web UI showed 6 `verifyEmailWorkflow` workflows permanently `RUNNING` (none ever finished), and DevTools Network showed `POST /leads/verify-emails` stuck pending, with no visual change in the UI
- [x] Confirmed root cause: `backend/src/workflows/workflows.ts` had `startToCloseTimeout: '1 second'` with no `retryPolicy` → Temporal retries indefinitely by default when there's no policy, and since the timeout (1s) is far shorter than the real delay (20s for `jane.smith`), the activity never completes on any attempt → an infinite retry loop. Secondary cause: `POST /leads/verify-emails` processed leads in a sequential `for` loop, so one stuck lead blocked feedback for the whole batch. Tertiary cause: `verifyEmailsMutation.isPending` in `LeadsList.tsx` was never used anywhere → zero visual feedback while verifying, even in the success case
- [x] Design decisions confirmed with the user (`AskUserQuestion`): (1) raise `startToCloseTimeout` to a realistic value + add a bounded `retryPolicy`, instead of just capping retries while leaving the timeout short; (2) parallelize the `/leads/verify-emails` batch with `Promise.allSettled` instead of leaving it sequential
- [x] Fix implemented:
  - `backend/src/workflows/workflows.ts`: `startToCloseTimeout: '30 seconds'` (above the worst simulated case of 20s) + `retry: { maximumAttempts: 3 }`
  - `backend/src/index.ts` (`POST /leads/verify-emails`): the sequential `for` became `leads.map(...)` + `Promise.allSettled`, preserving the response shape (`results`/`errors` per lead)
  - `frontend/src/components/LeadsList.tsx`: the "Verify Email" dropdown item in the Enrich menu now uses `verifyEmailsMutation.isPending` to show a spinner + "Verifying..." and disable itself while in progress (same pattern already used for the Delete button)
- [x] Tests: `workflows.test.ts` updated (verifies `startToCloseTimeout: '30 seconds'` + `retry: { maximumAttempts: 3 }`); `index.test.ts` +2 tests (parallel batch: a slow lead doesn't block a fast one — measured by total time staying close to the slowest, not the sum; a rejecting lead doesn't stop the rest); `LeadsList.test.tsx` +1 test (pending state visible and button disabled while the verification promise hasn't resolved, via a manually-controlled promise)
- [x] Coverage: backend branches 93.68% → 93.93%, frontend branches 97.77% → 97.81% — thresholds updated in the same change
- [x] Verified in the UI by the user: two screenshots — the first shows the Enrich dropdown with "Verifying..." (disabled, with a spinner) while the request is pending in the Network tab; the second shows the "Verified 2 emails" toast and John Doe/Jane Smith with a ✅ in the Email column after completion — confirms the batch no longer hangs and now gives visual feedback while it runs
- [x] Committed (`80e5c82` fix: stop email verification from hanging forever with no feedback)

## 3. Feature: new lead fields (phone, years at company, LinkedIn)

- [x] Before migrating: `backend/prisma/dev.db` had 34 leads (vs. the original 25) from manual testing of bugs 1 and 2 — reverted to the committed version (`git checkout -- backend/prisma/dev.db`, confirmed with the user) to avoid mixing test data with the schema change
- [x] Real Prisma migration (not just `prisma migrate status` this time): `phoneNumber String?`, `yearsInRole Int?`, `linkedinUrl String?` on the `lead` model → `backend/prisma/migrations/20261001142840_add_phone_years_linkedin/`
- [x] Naming/validation decisions (no design given, decided for consistency with the pattern already established in bug 1, without blocking to ask):
  - `yearsInRole` (not `yearsAtCompany`): matches the header already used by the repo's sample CSVs (`docs/leads-ok-*.csv`), avoids an unnecessary mapping layer
  - `phoneNumber`: accepted as free text, no format validation — the sample CSVs already contain very heterogeneous formats (`+1-280-754-0462x2154`, `(760)551-9973x6454`, `7549075690`), and a strict regex would reject real valid data
  - `yearsInRole`: must be a non-negative integer; if not, same non-blocking-warning pattern from bug 1 (cleared, row not blocked) — `backend/src/utils/yearsInRole.ts` / `frontend/src/utils/csvParser.ts`
  - `linkedinUrl`: must look like a linkedin.com URL (`/^(https?:\/\/)?([\w-]+\.)?linkedin\.com\/.+$/i`); same warning pattern — `backend/src/utils/linkedinUrl.ts` / `frontend/src/utils/csvParser.ts`
  - The 3 fields validate **independently** of each other and of the rest of the row (confirmed in the UI: an invalid `yearsInRole` doesn't affect the same lead's `linkedinUrl`, nor block the import)
- [x] `POST /leads/bulk`: sanitizes and validates the 3 new fields, response includes warnings alongside the countryCode ones
- [x] `POST /leads` and `PATCH /leads/:id` were **not** touched — no real consumer in the frontend (same finding we already had documented), out of scope
- [x] `generateMessageFromTemplate` (backend): the 3 new fields are now available as template variables, derived from a single list (`TEMPLATE_FIELD_KEYS`) instead of duplicating the `availableFields` object by hand
- [x] Scalable message-composition UX (the README explicitly asked us to think about this, "no design provided"): `MessageTemplateModal.tsx` groups the insertion buttons into categories (**Basic Info** / **Professional** / **Contact**) instead of a single row that grows without bound — adding the next field just means adding it to an existing group or creating a new one
- [x] Frontend: `csvParser.ts` (parsing + warnings), `CsvImportModal.tsx` (Phone/Years/LinkedIn columns in the preview + instruction text), `LeadsList.tsx` (Phone/Years at Company/LinkedIn columns — the last one as a "View profile" link)
- [x] Tests: backend +23 (new `linkedinUrl.test.ts`, `yearsInRole.test.ts`, cases in `messageGenerator.test.ts` and `index.test.ts`), frontend +12 (`csvParser.test.ts`, `CsvImportModal.test.tsx`, `LeadsList.test.tsx`, `MessageTemplateModal.test.tsx`)
- [x] Coverage: backend branches 93.93%→94.78%, frontend branches 97.81%→98.03% (statements 99.74→99.76, functions 92.85→93.1) — thresholds updated
- [x] Verified in the UI by the user with `docs/test-feature3-fields.csv` (not committed, manual-test fixture): preview shows 4/4 valid with 2 warnings (Bob: invalid `yearsInRole` "five" cleared; Carol: invalid `linkedinUrl` "not-a-url" cleared, with their other new fields intact); main table shows all 3 new columns correctly populated after import; "Generate Messages" modal shows the Basic Info/Professional/Contact groups with `{yearsInRole}`, `{phoneNumber}`, `{linkedinUrl}` available
- [x] Committed (`eec8a77` feat: add phone, years in role, and LinkedIn fields to leads) — later amended once (see note below)
- [x] **Pollution caught by the user after committing**: a mass "Verify Email" click during exploration had flipped `emailVerified` for 23 of the 25 original leads from `null` to `true`/`false`, and this silently got baked into the commit alongside the legitimate schema migration. Root-caused by comparing `emailVerified` distributions in the originally-committed DB vs. the working copy via direct `sqlite3` queries. Fixed by reconstructing a clean `dev.db` (original commit's data + only the real `ALTER TABLE` statements for the 3 new columns + the matching `_prisma_migrations` row) and amending the commit (`git commit --amend --no-edit`, justified since the branch wasn't pushed anywhere and no commits existed after it) → new hash `eec8a77`

## 4. Feature: "enrich phone" workflow with Temporal

- [x] Before implementing: real schema migration (`phoneEnriched Boolean?` on `lead`, same pattern as `emailVerified` — `null`=never attempted, `true`=found, `false`=attempted with no data) → `backend/prisma/migrations/20261001150528_add_phone_enriched/`
- [x] Abstraction layer (`backend/src/workflows/activities/phoneProviders.ts`, new): each provider has its own request/auth/response shape (`x-auth-me` header vs. `apiKey` header vs. query param; `phone` vs. `phoneNmbr` vs. `phoneNmbr`); the 3 functions (`callOrionConnect`/`callAstraDialer`/`callNimbusLookup`) normalize everything to `PhoneLookupInput`/`PhoneLookupResult` so the workflow never has to know any provider's quirks
- [x] `enrichPhoneWorkflow` (`backend/src/workflows/workflows.ts`): sequential cascade Orion Connect → Astra Dialer → Nimbus Lookup, stops at the first phone found; a provider that exhausts its retries and throws is treated the same as "found nothing" (moves on to the next one) instead of failing the whole workflow; returns `null` if no provider returns a phone, including when providers fail
- [ ] Follow-up identified during documentation review: distinguish `found`, `not_found`, and `failed` outcomes. Currently, exhausted provider failures can be persisted as `phoneEnriched: false` and displayed as "No data found", preventing further attempts for that lead. Preserve failure information and allow retrying transient failures without duplicating concurrent workflows; this is not implemented (see `IMPROVEMENTS.md`, finding #11)
- [x] A separate `proxyActivities` from `verifyEmail`'s: `startToCloseTimeout: '10 seconds'` + `retry: { maximumAttempts: 3, backoffCoefficient: 2 }` per provider
- [x] Idempotency on two layers: a deterministic `workflowId` of `enrich-phone-{leadId}` (no timestamp, unlike `verify-email-{id}-{Date.now()}`) prevents duplicate concurrent runs per lead at the Temporal level; at the application level, `POST /leads/enrich-phone` skips (marks `skipped: true`, doesn't trigger a workflow) any lead that already has `phoneNumber` or `phoneEnriched !== null`, to avoid re-querying external providers for leads already resolved
- [x] `POST /leads/enrich-phone` (`backend/src/index.ts`): same pattern as `/leads/verify-emails` (parallel `Promise.allSettled`, per-lead errors without stopping the batch), responds with `{ success, enrichedCount, noDataCount, skippedCount, results, errors }`
- [x] Frontend: `api/modules/leads.ts` (+`enrichPhone`), `api/types/leads/enrichPhone.ts` (new), `getMany.ts` (+`phoneEnriched`); `LeadsList.tsx` — "Enrich Phone" button in the Enrich dropdown (same spinner/disabled pattern as "Verify Email"), toast with found/no-data/skipped counts, Phone cell shows "No data found" in italic gray when `phoneEnriched === false` (distinct from "-" when never attempted)
- [x] Nice to have (provider rate limiting): **deferred** because provider quotas are unspecified. Exponential backoff handles retries but does not enforce aggregate request limits across leads or workers
- [ ] Follow-up: add configurable per-provider concurrency and request limits, coordinated across workers when needed, with HTTP `429`/`Retry-After` handling. Set quotas from provider contracts rather than guessing sandbox limits; this is not implemented (see `IMPROVEMENTS.md`, finding #12)
- [x] Tests: backend +9 (`phoneProviders.test.ts`, new) + cases in `workflows.test.ts` (correct proxying, fallback between providers, "all 3 fail" case) + `index.test.ts` (+8: body validation, 404, successful enrich with deterministic `workflowId`, `companyWebsite` populated from `companyName`, no-data, skip due to existing `phoneNumber`, skip due to already-set `phoneEnriched`, no re-run on a second call, per-lead errors); frontend +6 in `LeadsList.test.tsx` (success, toast with no-data/skipped, error, pending state, "No data found" vs. "-")
- [x] Coverage: backend branches 94.78%→95.51%, frontend `{statements: 99.77, branches: 98.14, functions: 93.54, lines: 99.77}` — thresholds updated in the same commit
- [x] **Two real bugs found only by testing against the real sandbox** (`https://api.enginy.ai/api/tmp/*`), invisible to the mocked tests because the mocks replicated the README's spec, which turned out to be wrong on both points:
  - Orion Connect returns `400 "Missing required input"` if `companyWebsite` is `null`/empty/omitted (confirmed via direct `curl`); since `lead` has no dedicated website field, decided to pass `companyName` instead. Limitation identified during documentation review: this avoids the sandbox's missing-input error but is not semantically equivalent to a company website; lookup correctness remains unverified until a real company domain is available (see `IMPROVEMENTS.md`, finding #3)
  - Nimbus Lookup responds with `phoneNmbr`, not `number` as the README documents (confirmed via 3 consistent direct `curl` calls) — the original code read `data.number`, so this provider was silently broken (always returned `null`) despite passing every test, since the mocks also assumed the README's wrong field name
  - Orion Connect returned intermittent HTTP `500` responses during a small manual `curl` sample, consistent with the README's description that it sometimes fails. Retry (3 attempts) and fallback handled the observed failures; the sample is insufficient to estimate a failure rate or compare provider reliability (see `IMPROVEMENTS.md`, finding #4)
- [x] Verified in the UI by the user: after an initial 404 caused by a zombie `ts-node` process holding port 4000 (unrelated to the code, diagnosed and fixed by killing the process), the workflow for Jane Smith (`enrich-phone-2`) completed successfully despite several intermittent `500`s from Orion Connect — final response `{success: true, enrichedCount: 1, noDataCount: 0, skippedCount: 0}` with the phone found, visible in both the Network tab and the Phone column in the table
- [x] `backend/prisma/dev.db`: cleared `phoneNumber`/`phoneEnriched` for John Doe and Jane Smith (manual-test data) before committing, leaving only the real schema migration — same care as in feature 3 after the `emailVerified` pollution finding
- [x] Committed (`1adbbcc` feat: add phone enrichment workflow via Orion/Astra/Nimbus cascade)

## 5. PR Review

- [x] Located the PR: remote branch `origin/feature/implement-gender-guessing` (commit `e666b22`, branches off the `Initial commit`). Also exists `origin/dependabot/npm_and_yarn/frontend/vitest-4.1.11` (automatic bump, not "the" teammate PR)
- [x] Confirmed it's a real, open PR on GitHub (`gh pr list` → PR #1, `Feature/implement gender guessing`, `Genesy-AI/technical-task-bismark`)
- [x] Reviewed the full diff (13 files, +257/-8): migration (`gender String?`), `backend/src/index.ts` (`POST /leads/guess-genders`), `csvParser.ts`/`csvParser.test.ts`, `LeadsList.tsx`, `api/` types
- [x] User's decision: document the full review here (locally), **without posting comments or the summary to the real GitHub PR** — using `gh` to leave real inline comments was considered, but decided against touching the public PR
- [x] Inline comments (`file:line` reference against `e666b22`):

  **`backend/src/index.ts:199`** (inside `POST /leads/guess-genders`)
  > The provider `fetch` has no explicit application-level timeout, and this loop processes leads sequentially. A stalled provider request can block the remaining leads and delay feedback for the whole batch. Please add an explicit timeout and bounded retries for transient failures. Consider bounded concurrency with per-lead failure isolation while respecting provider quotas. Temporal is one option for durable execution, but the required behavior is bounded execution and predictable failure reporting, not a particular implementation.

  **`backend/src/index.ts:172-199`** (full handler)
  > A lead that already has `gender` set is queried again every time "Guess Gender" is clicked. Consider skipping resolved leads by default and making refresh an explicit action, with a policy for retrying `unknown` results. This avoids unnecessary provider calls and quota consumption; it is a recommendation for this feature, not a skip behavior already implemented by email verification.

  **`backend/src/index.ts` (new route) / missing backend route tests**
  > The PR adds no backend tests for this route, which calls an external API and writes to the database. Please cover successful updates, missing gender data, provider failures, timeouts, and partial batch failures. This request follows from the route's risks, not from the coverage added later in the take-home branch; `index.test.ts` does not exist in the reviewed PR branch.

  **`frontend/src/utils/csvParser.ts:108-109`**
  > An invalid optional `gender` value is added to `errors`, rejecting the entire row even when its required fields are valid. Consider clearing the invalid field and showing a non-blocking warning so otherwise-valid leads can still be imported. This is a product recommendation and would align with the optional-field validation introduced in the take-home branch; that convention was not present in the PR's base commit.

  **`frontend/src/components/LeadsList.tsx:63-65`**
  > `toast.success(successMessage)` fires even when `data.errors.length > 0` and `data.updatedCount === 0` (i.e., when **every** lead failed) — the message says "Failed to guess genders for N leads." but renders as a green success toast. Should be `toast.error` (or at least a warning style) when `updatedCount === 0`.

- [x] Minor findings (non-blocking, mentioned in the summary but without a dedicated inline comment):
  - `dotenv` + `GENDERIZE_API_BASE_URL` is a good pattern for testing without hitting the real API, but no `.env.example` was added documenting the new variable
  - The success toast for partial failures (`data.errors.length > 0 && data.updatedCount > 0`) does make sense as-is (it's a genuine partial success) — the issue is specifically the zero-success case
- [x] **Final verdict: Request Changes.** The happy path appears supported by code inspection, not runtime verification. The missing explicit provider timeout and bounded transient-failure retries (#1), together with the lack of backend route tests (#3), are the main blockers: execution should be bounded and failure handling verified before merging. Temporal is an implementation option, not a mandatory condition for approval. The misleading all-failed success toast should also be corrected; skipping resolved leads and non-blocking optional-field validation are recommendations to discuss with the teammate.

## 6. Codebase Analysis & Roadmap

- [x] Created `IMPROVEMENTS.md` (PM-doc style) with findings and a technical roadmap, folding in every finding collected across tasks 1-5 (dead code, orphan dependencies, the `name`/`firstName` inconsistency, the gender-guessing PR's gaps, the two live-API bugs, etc.)
- [x] Findings included: `frontend/src/api/mutations/useApiMutation.ts` is dead code (no consumers), candidate for removal; test coverage was ~8% in both projects before this session (only pure utils had tests); (positive) `frontend/src/api/utils.ts`'s `endpoint()` with TS overloads to vary Input/Output per HTTP verb is a clean pattern worth keeping as the convention for new endpoints
- [x] Translated this file to English and renamed it from `TASKS.md` to `WORKING_NOTES.md` (better reflects its actual content — a reasoning/decision log, not a to-do list) — all references updated in `AGENTS.md`, `frontend/CLAUDE.md`, and `IMPROVEMENTS.md`
- [x] Decided with the user: commit both `IMPROVEMENTS.md` and this file as the final step, since this is a take-home evaluated partly on reasoning/trade-offs — `AGENTS.md`'s "never committed" rule was updated accordingly
