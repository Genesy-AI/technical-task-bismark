# TinyEnginy — Codebase Analysis & Roadmap

_Prepared as part of the TinyEnginy take-home. Format follows our usual PM-style
doc: current state, findings grouped by risk area, then a prioritized roadmap._

## Summary

The common paths for CSV import and lead enrichment work with the fixes delivered in this
engagement, but reliability limitations remain before production use. In particular, phone
enrichment can persist provider failures as definitive no-data results (finding #11).
Beyond that concrete issue, a structural risk is
that three different "call a 3rd-party API per lead" features (email verification, phone
enrichment, gender guessing) ended up with three different reliability postures, because
there's no shared convention for how enrichment features should be built. Test coverage was
also close to zero before this engagement (~8% on both projects) and is now ~100%/95.5%
(backend, stmt/branch) and ~99.8%/98.1% (frontend) — a good foundation to build on, but
coverage alone doesn't catch contract drift against real external APIs (see below).

## Current state

- **Backend:** Express 5 + Prisma/SQLite + Temporal (`@temporalio/client`/`worker`/`workflow`).
  `verifyEmailWorkflow` and `enrichPhoneWorkflow` run through Temporal (retry policies,
  bounded timeouts); the gender-guessing feature (open PR #1) does not.
- **Frontend:** React + Vite + TanStack Query + Tailwind. CSV import and the leads table are
  the two primary surfaces; both now have a consistent "non-blocking warning, independent
  per-field validation" pattern for optional CSV fields (`countryCode`, `yearsInRole`,
  `linkedinUrl`) — except `gender` in the open PR, which doesn't follow it.
- **Coverage:** backend 100% stmt / 95.51% branch / 100% func / 100% lines; frontend 99.77%
  stmt / 98.14% branch / 93.54% func / 99.77% lines. Coverage thresholds are enforced by
  the local `test:coverage` scripts and Claude Code pre-commit hook. No repository CI
  pipeline is currently configured.

## Findings

### Reliability

1. **Enrichment features lack a shared reliability contract.** In the take-home branch,
  `verifyEmailWorkflow` and `enrichPhoneWorkflow` use Temporal with explicit activity
  timeouts and bounded retry policies. Phone enrichment additionally skips resolved leads.
  PR #1 branches from the initial commit, so these later changes are not conventions
  established in its base. Its gender-guessing route calls `genderize.io` sequentially
  without an explicit application-level timeout or retries, and re-queries leads whose
  `gender` is already set. The main risk is unbounded waiting and delayed batch feedback,
  not the absence of Temporal itself. **Recommendation:** document a shared contract for
  explicit timeouts, bounded transient-failure retries, per-lead outcomes, and provider
  quota handling. Define skip/refresh behavior for resolved leads. Use Temporal when durable
  execution is needed; other implementations are acceptable if they meet the contract.

2. **Email verification is fully mocked.** `backend/src/workflows/activities/utils.ts`'s
   `verifyEmail` never calls a real service — it's a stub keyed off substrings in the address:
   ```ts
   export async function verifyEmail(email: string): Promise<boolean> {
     if (email.includes('john.doe')) return false
     if (email.includes('jane.smith')) await new Promise((resolve) => setTimeout(resolve, 20000))
     if (/\+/.test(email)) return false
     return true
   }
   ```
  The simulated 20s delay for `jane.smith` addresses exceeded the original 1s activity
  timeout. With unbounded retries, verification could never complete for those addresses
  (bug 2, fixed separately). But the underlying "verification" is still fake — a ✅ in the
   UI means nothing about real deliverability. Fine for a take-home; would be misleading if
   this shipped as-is. **Recommendation:** swap in a real provider before this goes beyond a
   demo, or at minimum label it clearly as a placeholder in the UI.

3. **README-documented third-party API contracts don't match the live sandbox.** Discovered
   while implementing phone enrichment: Orion Connect 400s on an empty/missing `companyWebsite`
   (undocumented required field — `lead` has no website column, worked around by passing
  `companyName`). This avoids the sandbox's missing-input error, but a company name is not
  semantically equivalent to a company website. Lookup correctness remains unverified until
  a real company domain is available. Nimbus Lookup's real response field is `phoneNmbr`,
  not `number` as the README states. Both were silent failures that passed every mocked unit
  test, because the mocks were written to match the (wrong) README spec rather than the
  real API. This is a
   general risk, not specific to these two providers: nothing in the test suite verifies the
   written API contracts against reality. **Recommendation:** a small, manually-triggered
   contract-check script (hits each real sandbox endpoint once, asserts the response shape)
   would have caught both of these before they shipped.

4. **Intermittent Orion Connect failures observed in manual testing.** HTTP 500 responses
  were observed during a small manual sample using `curl`, consistent with the README's
  description that the provider sometimes fails. Retries and fallback handled these
  failures, but the sample is insufficient to estimate the provider's failure rate or rank
  its reliability against Astra/Nimbus. Track per-provider success rates and latency before
  considering changes to the provider order.

### Testing gaps

5. **The open gender-guessing PR has zero backend tests** for its new route
  (`POST /leads/guess-genders`). The route calls an external API and writes to the database;
  recommended coverage includes successful updates, missing gender data, provider failures,
  timeouts, and partial batch failures. This recommendation is based on the route's risks,
  not on the coverage added separately in the take-home branch after the PR's base commit.
  Full detail in the PR review (not posted publicly per instruction — see `WORKING_NOTES.md`
   section 5 for the inline-comment-equivalent notes).

6. **Infrastructure-error fallback paths in `backend/src/index.ts`** aren't covered and are
  deliberately excluded (`/* v8 ignore */` with inline reasoning) because
  there's no cheap way to force Prisma/Temporal to fail without mocking their internals.
  Existing `console.error` calls provide basic error visibility, but there is no structured
  logging, request/workflow correlation, or enrichment metrics. **Recommendation:** add
  these capabilities to make production failures traceable and measurable.

### Code health / dead code

7. **`frontend/src/api/mutations/useApiMutation.ts` has zero consumers** (confirmed by grepping
   imports across `src/`). It's the only reason `lodash` and `ts-toolbelt` remain in
   `package.json` — both are used nowhere else. Deferred to the end of this engagement rather
   than removed mid-task, to avoid mixing unrelated cleanup into bug/feature commits.

8. **`@tabler/icons-react` is an orphan dependency.** Its only reference is a type alias
   (`TablerIcon` in `globalTypes.d.ts`) that itself has no consumers. Same cleanup batch as #7.

9. **`POST /leads` and `PATCH /leads/:id` read `req.body.name`, not `firstName`** — inconsistent
   with every other endpoint (bulk import, CSV parser, frontend) which all use `firstName`.
   Neither endpoint has a real frontend consumer today, so this is latent rather than an active
   bug, but it would silently misbehave (create a lead with no first name) if something started
   calling them with the same shape used everywhere else in the codebase.

10. **Backend has no linter.** `pnpm format` (Prettier) exists but there's no `eslint` config or
    `lint` script, unlike the frontend. Not urgent, but means style/correctness issues that
    ESLint would catch (unused vars, implicit `any`, etc.) have no automated gate on this side.

### Enrichment follow-up risks

11. **Phone enrichment conflates missing data with provider failures.** The workflow catches
  exhausted activity failures and continues to the next provider. If no phone is returned,
  it resolves to `null` even when providers failed rather than confirmed no data. The API
  persists `phoneEnriched: false`, displays "No data found", and skips future attempts for
  that lead. A temporary outage can therefore become a definitive no-data result.
  **Recommendation:** distinguish `found`, `not_found`, and `failed` outcomes; preserve
  provider failure information and allow retrying transient failures without duplicating
  concurrent workflows. Test all-no-data, all-failed, mixed, and successful fallback cases.

12. **Provider rate limiting is not implemented.** Exponential backoff spaces retries, but
  does not enforce aggregate request limits across leads or workers. Parallel batches can
  exceed future provider quotas even with bounded retries. **Recommendation:** introduce
  configurable per-provider concurrency and request limits, coordinated across workers
  when needed, and handle HTTP `429` responses using `Retry-After` when available. Set
  quotas from provider contracts rather than guessing fixed limits for the sandbox.

### Positive findings (worth keeping, not changing)

- `frontend/src/api/utils.ts`'s `endpoint()` — TS overloads varying Input/Output type per HTTP
  verb — is a clean pattern. Followed it for the new `enrichPhone` endpoint rather than
  inventing something else; recommend keeping it as the standing convention for new endpoints.
- The "non-blocking warning, independent per-field validation" pattern established for
  `countryCode` (bug 1) and reused for `yearsInRole`/`linkedinUrl` (feature 3) scales well —
  each field validates independently, one bad field doesn't block an otherwise-valid row. The
  open gender-guessing PR is the one place that doesn't follow it (see Reliability #1 and the
  PR review).

## Roadmap

**Now (before next release):**
- Decide on a real email-verification provider, or explicitly label the current check as a
  placeholder in the UI (finding #2).
- Resolve the gender-guessing PR's reliability/testing gaps (findings #1, #5) before merging.
- Separate phone-enrichment failures from confirmed no-data results and allow retries for
  transient failures (finding #11).

**Next:**
- Document the enrichment reliability contract: explicit timeouts, bounded transient-failure
  retries, per-lead outcomes, provider quota handling, and skip/refresh behavior. Use Temporal
  when durable execution is needed, rather than requiring it for every feature (finding #1).
- Add a lightweight contract-check script against the real provider sandboxes (finding #3) —
  cheap insurance against README drift causing silent failures again.
- Add configurable per-provider concurrency and request limits, with `429`/`Retry-After`
  handling before provider quotas take effect (finding #12).
- Clean up dead code in one batch: `useApiMutation.ts`, `lodash`, `ts-toolbelt`,
  `@tabler/icons-react`, `TablerIcon` (findings #7, #8).

**Later:**
- Add ESLint to the backend (finding #10).
- Extend basic console logging with structured logs, request/workflow correlation, and
  enrichment metrics (finding #6).
- Fix or remove `POST /leads`/`PATCH /leads/:id`'s `name` vs `firstName` inconsistency
  (finding #9) — low urgency only because nothing calls them today.
