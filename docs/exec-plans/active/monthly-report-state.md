# Monthly report display state correction

## Scope and acceptance

Base: main `fdca0da5229193acf9c592522c5ec23278f37e80`.
Branch: `codex/monthly-report-state`. Root owns implementation; independent review follows a fixed local SHA.

Only the monthly report page changes product behavior. Loading, failed requests,
missing/incomplete payloads and school/month switches must not display sample
scores, ranks, metrics, comments or actions. A complete successful report,
including actual zero, remains intact. Late responses cannot overwrite the
current selection. The fixed GBP comparison is replaced by an unavailable notice.

Inspected: report/page.tsx, mock/reportData.ts, mock/insightData.ts,
dashboard-reports.ts, reports API route, existing component and browser fixtures,
architecture, development and verification rules. Existing school authorization,
server aggregation, score calculation and AIO contracts are unchanged.

## Remaining API limitation

The successful reports API currently substitutes zero for absent metrics, can
use a fixed school baseline and latest stored report fallback, and still consumes
legacy AIO summaries. This page cannot distinguish those values from measurements
in the existing response contract. It does not claim to resolve that limitation,
recalculate partial scores or alter comparison periods. That requires a separate
API/data-contract task before claiming full measurement provenance.

## Progress and evidence

- [x] Existing worktree/branch inventory checked; no duplicate report work.
- [x] App worktree creation failed with "Not a git repository" at the chat root.
  No partial worktree or branch existed. Normal git worktree creation from the
  existing shared bare repository succeeded; no new repository was created.
- [x] Correct origin and codex:preflight passed.
- [x] TDD: 20 component cases, 19 failed / 1 passed before implementation.
- [x] First implementation: all 20 component cases pass.
- [x] Initial full codex:verify: 2,202 tests / 174 files, existing 95% coverage
  gates, typecheck, lint (six inherited warnings), build and 96 E2E
  (48 desktop / 48 mobile) passed; command exit 0.
- [x] Independent review of cafb06839e9c449b65acee25b3edb79ea9526d77
  found two P2 issues: a manual month reappeared after a URL month round trip,
  and the returned report period was hidden when the API fell back to an older
  report. The period test reproduced the missing display. The first URL-roundtrip
  test reused a consumed Response; after fixing that test fixture to create a
  fresh Response per request, the pre-fix URL state reproduced July instead of
  August. Both failures are retained in separate red logs.
- [x] Corrected URL-month selection invalidation during render and separately
  displayed the returned report period. All 22 focused tests pass. Browser
  coverage now also asserts requested vs returned period mismatch disclosure.
- [ ] Publication after deployment suppression is demonstrably authorized.

Final-code full verification and fixed-SHA rereview receipts belong in the
evidence directory below. They must be checked before publication; this plan
does not assert a future CI or local run has passed.

Evidence directory outside checkout: outputs/monthly-report-state, relative to
the parent chat workspace. Commands: NODE_ENV=test npm test -- report/page.test.tsx;
PLAYWRIGHT_BROWSERS_PATH=<existing local cache> npm run codex:verify.
Browser/API data are synthetic; no live OAuth/provider/DB acceptance is claimed.

## Publication boundary

The new branch is not listed in main's vercel.json deploymentEnabled false map.
Existing branch-specific suppression approval does not authorize adding this
branch. Keep vercel.json unchanged and stop before push/PR creation unless that
exact suppression is separately authorized. No main merge, production deployment,
aliases, schema/data, auth settings, environment variables, secrets, billing,
Jev calls or browser/CUA operations. PR24/25 are out of scope and untouched.

## Authorized release extension — 2026-10-24

The user subsequently authorized this correction through production, subject to
existing main/Production protection and any final-SHA approval requirement.
Exact-branch deployment suppression for codex/monthly-report-state and its
matching test are now authorized and applied. Main/other branch settings stay
unchanged. Earlier publication-gated receipts are historical.

The user explicitly selected reference-only presentation for MonthlyReport
values whose measurement provenance cannot be established. The page identifies
stored reports and operational aggregates as reference values, never verified
measurements. Legacy AIO is labeled as an old stored score. This resolves the
display decision without changing the database or attempting to infer whether
an existing default zero was measured.

Additional implementation:

- Remove the hard-coded school baseline and static action suggestions.
- Add source and per-field availability metadata before zero normalization.
  Existing score formula and partial-input numerical compatibility remain
  unchanged; the UI hides the score/rank when required inputs are unavailable.
- Preserve existing zero-valued source rows using row-presence evidence, without
  asserting that row presence proves full measurement coverage.
- Preserve latest-report and latest-rank lookup semantics, disclose returned
  report period and potential out-of-period ranking input.
- Reports now require the existing active-profile resolver, authentication and
  explicit school authorization; the page supplies the existing session bearer.
  This closes an observed tokenless fallback-admin path without changing Auth
  configuration, roles, RLS or shared resolver behavior. Responses are private,
  no-store; read-only resolution avoids invitation/profile writes.

New tests cover tokenless access, pending profiles, cross-school denial with the
real resolver, editable-metadata spoofing, missing/partial/all-zero data, response
errors, consecutive switches and delayed session/response resolution. E2E uses
the actual payload builder for missing/partial/zero cases and mocks only network
and identity/data boundaries.

Release evidence: parent workspace outputs/monthly-report-release-2026-10-24.
Final fixed-SHA full verification, independent review and push/PR CI are required
before release. Do not reuse previous 57f6774 verification as final-code proof.
GitHub ruleset 24785246 requires a PR and strict Codex Verify with no bypass.
Classic branch-protection read returned 403; no alternate credential was used.

The previous --prod --skip-domain incident moved generated aliases despite
skipping custom domains. Do not create a supposedly alias-free Production
candidate using that flag alone. Snapshot every current production domain/alias,
identify the deployment actually behind each alias, and document rollout and
rollback side effects before the final publication decision. No production
operation has yet been performed by this release extension.

Independent review of 6cb8462 found that the shared scoped-school helper could
replace an already authorized requested school with the manager's primary school.
The report route now reads exactly the school checked by canAccessSchool. Two
real-resolver regression cases failed before the change and pass afterward:
multi-school membership and a primary school absent from the membership list.
No shared role or membership behavior was changed. Full verification of 6cb8462
passed (including 98 browser cases); the corrected final SHA is reverified.

Vercel project access returned scope 403. The user completed the official team
consent link, but retrying the same request on the same connection still returned
403. No alternate credential or deployment attempt was used. Production remains
blocked until this connection can read the project and current alias targets.
