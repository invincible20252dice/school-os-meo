# Google inquiry / meeting: invalidate results after a saved mutation

## Scope and observed flow

Started from main `a17040c` on `codex/google-lead-measurement`, independent of
unmerged AIO PR #4. PM has deferred Places at that draft, without production
deployment or live acceptance. This work does not carry its changes.

Existing `GoogleResultsClient` manually records inquiries confirmed as Google
Search/Maps sourced, via LINE/phone/Web +1. The server fixes source to google,
uses a school-scoped idempotency key and stores the inquiry timestamp.
`changeGoogleLead` uses school authorization and version compare-and-swap.
The existing 'meeting' status records when the operator updates it; scheduling
and actual attendance are not distinct states. Inquiry cohorts and meeting-month
counts are computed by `aggregateLeads`; clicks remain a separate metric.
No automatic attribution or enrollment flow is established by this screen.

## Defect and proposed behavior

After POST/PATCH/DELETE succeeds, a failed follow-up GET leaves pre-save KPI and
rows visible and re-enables +1/actions. A saved inquiry can still look like zero,
and clicking +1 again uses a new key because the previous save succeeded.
The existing notice alone does not invalidate these misleading results.

Invalidate the results immediately after a successful mutation, before GET.
On GET failure show saved-but-unavailable as an alert with explicit GET retry;
do not expose stale counts or mutation controls until retrieval succeeds.
Failed writes retain existing retry/idempotency behavior. School switch responses
remain guarded by abort/generation. No API, schema, auth, provider or cost changes.

## Acceptance / progress

- [x] Read rules, UI, API/access, store, aggregator, schema and existing tests.
- [x] Failing component regression for saved POST/PATCH/DELETE plus failed GET.
- [x] Fix invalidation and verify retry does not repeat writes.
- [x] Desktop/mobile E2E: manual inquiry -> meeting -> saved/read failure -> retry,
  reload, school isolation; synthetic API only. Inspect screenshots.
- [x] Local codex:verify; verification-branch deployment disabled.
- [x] Exact-head Linux CI; draft PR #5.

## Verification evidence

Three regression cases failed on the original implementation, then passed with
the fix. A delayed-read case also proves that stale values disappear before the
read resolves and that an old school's failure cannot replace the new school.
Local aggregate: 9 tooling tests, 160 Vitest files / 1,922 tests, typecheck,
lint (six existing warnings), plain build, and 30 Chromium E2E cases passed.
Coverage: statements/lines 99.24%, branches 97.39%, functions 99.77%; existing
thresholds/exclusions unchanged. Targeted new browser cases passed on desktop
and iPhone 13 emulation. Failure/recovery full-page screenshots were inspected.

Initial typecheck encountered old AIO generated types in `.next-codex`; moved
that generated build aside without changing source. Initial browser assertions
matched both the real error and Next's empty route announcer; scoped the locator
to the actual saved-read alert and reran targeted E2E, then the full aggregate.

Vercel read-only project inspection confirmed `school-os-meo` and production
branch `main`. `codex/google-lead-measurement` is explicitly disabled in
`vercel.json`, with the existing tooling assertion extended. This fulfills the
push/deploy boundary; no main push, preview, deployment or settings mutation.

The browser API uses per-test in-memory synthetic records and the real
aggregation helper. Existing route/store tests cover auth, school scope, CAS,
idempotency and errors; existing PGlite tests cover SQL constraints. These do
not certify live Prisma transport or production persistence. No Supabase
production inspection or customer write was performed.

Next safe task: strengthen the existing route/store/SQL integration acceptance
using isolated PGlite, without changing attribution or meeting semantics.
Automatic attribution, distinguishing scheduled from held interviews, and
enrollment tracking require a separate concrete specification/PM decision.

## Completed bounded fix / release remains separate

Draft PR: https://github.com/invincible20252dice/school-os-meo/pull/5

Linux Codex Verify completed success on exact implementation commit
`7c608a1832c19e3b092b86f42104e2b871681435` (1,922 tests, build and 30 E2E):
https://github.com/invincible20252dice/school-os-meo/actions/runs/37914088470

This plan closes the saved-write/read-failure fix only. PR remains draft and
unmerged; no production acceptance or complete automated acquisition funnel is
claimed. Later documentation-only heads must pass their own CI, rather than
being attributed to this implementation run. Final handoff carries that exact
head/run mapping. Rollback is the application change only; no DB action needed.

No migrations, customer records, API credentials or paid calls. Production
release, live persistence and attribution/scheduled-vs-held semantics remain out
of scope. Next safe work follows evidence from this bounded manual flow.
