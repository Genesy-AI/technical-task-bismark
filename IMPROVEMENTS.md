# TinyEnginy — Codebase Analysis & Roadmap

_Prepared as part of the TinyEnginy take-home. Format follows our usual PM-style
doc: current state, findings grouped by risk area, then a prioritized roadmap._

## Summary

The app works and the two main user flows (CSV import, lead enrichment) are solid once the
bugs fixed in this engagement are in. The biggest structural risk isn't any single bug — it's
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
  stmt / 98.14% branch / 93.54% func / 99.77% lines. Both pinned as CI-enforced floors.

## Findings

### Reliability

1. **Three enrichment features, three different reliability designs.** `verifyEmailWorkflow`
   and `enrichPhoneWorkflow` both go through Temporal with explicit `startToCloseTimeout` +
   `retry` policies, and `enrichPhoneWorkflow` additionally has application-level idempotency
   (`phoneEnriched`/skip-if-already-resolved). The gender-guessing feature (PR #1, not yet
   merged) calls `genderize.io` directly from the Express handler in a sequential `for` loop,
   with no retry and no idempotency check — a lead with `gender` already set gets re-queried
   every time. There's no written convention saying "enrichment features go through Temporal
   with a retry policy," so each one was built from scratch with a different risk profile.
   **Recommendation:** write that convention down (even just a short section in `backend/CLAUDE.md`
   or a `CONTRIBUTING.md`) and require new enrichment features to follow it.

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
   The 20s delay for `jane.smith` addresses was the root cause of bug 2 (hang with no
   feedback), fixed separately. But the underlying "verification" is still fake — a ✅ in the
   UI means nothing about real deliverability. Fine for a take-home; would be misleading if
   this shipped as-is. **Recommendation:** swap in a real provider before this goes beyond a
   demo, or at minimum label it clearly as a placeholder in the UI.

3. **README-documented third-party API contracts don't match the live sandbox.** Discovered
   while implementing phone enrichment: Orion Connect 400s on an empty/missing `companyWebsite`
   (undocumented required field — `lead` has no website column, worked around by passing
   `companyName`), and Nimbus Lookup's real response field is `phoneNmbr`, not `number` as the
   README states. Both were silent failures that passed every mocked unit test, because the
   mocks were written to match the (wrong) README spec rather than the real API. This is a
   general risk, not specific to these two providers: nothing in the test suite verifies the
   written API contracts against reality. **Recommendation:** a small, manually-triggered
   contract-check script (hits each real sandbox endpoint once, asserts the response shape)
   would have caught both of these before they shipped.

4. **Orion Connect fails ~50% of the time by design** (confirmed via direct `curl`, matches the
   README's own description). Currently absorbed by retry + cascade to the next provider — the
   right mitigation already exists — but it means Orion is a weak primary provider; if
   enrichment volume grows, the real success rate is bottlenecked more by Astra/Nimbus than by
   Orion. Worth tracking (not fixing) if phone enrichment usage increases.

### Testing gaps

5. **The open gender-guessing PR has zero backend tests** for its new route
   (`POST /leads/guess-genders`) — a real gap against this project's otherwise ~100% backend
   coverage. Full detail in the PR review (not posted publicly per instruction — see `WORKING_NOTES.md`
   section 5 for the inline-comment-equivalent notes).

6. **Generic `catch` blocks in `backend/src/index.ts`** (5 of them, one per route) aren't
   covered and are deliberately excluded (`/* v8 ignore */` with inline reasoning) because
   there's no cheap way to force Prisma/Temporal to fail without mocking their internals. Not
   a bug, but a signal: without a real logger/observability layer, these generic 500s give no
   operator visibility into what actually failed in production.

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

**Next:**
- Write down the "enrichment features go through Temporal with a retry policy" convention
  (finding #1) so the next one doesn't repeat the gender-guessing approach.
- Add a lightweight contract-check script against the real provider sandboxes (finding #3) —
  cheap insurance against README drift causing silent failures again.
- Clean up dead code in one batch: `useApiMutation.ts`, `lodash`, `ts-toolbelt`,
  `@tabler/icons-react`, `TablerIcon` (findings #7, #8).

**Later:**
- Add ESLint to the backend (finding #10).
- Introduce a real logger so the generic 500 `catch` blocks are debuggable in production
  (finding #6).
- Fix or remove `POST /leads`/`PATCH /leads/:id`'s `name` vs `firstName` inconsistency
  (finding #9) — low urgency only because nothing calls them today.
