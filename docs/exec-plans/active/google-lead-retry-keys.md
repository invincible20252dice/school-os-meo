# Preserve unresolved Google inquiry retries across channels and schools

## Baseline and completed work

Start from main `1eb88fd53248bda18a73e6ab3559544b1da8dbff`, whose runtime
matches stable production `25f39b138684dd67c652d7fba345fb6c9cc5c29f`.
PR #20 alignment and stable-domain preservation are complete. Canonical auth and
logout remain unresolved, temporarily isolated and observation-insufficient;
no production OAuth retest until a safe fixed verification environment exists.

Read AGENTS, product/development rules, architecture, testing, ExecPlan guidance,
and the repository verification skill. Main lacks AUTONOMOUS_PM_POLICY.md;
the existing separate PR #19 version was read without importing that PR.

PR #5 already completed manual inquiry -> scheduled -> held -> enrolled,
nullable milestones/CHECK/index production application, real Supabase persistence,
reload, isolation, concurrency and duplicate acceptance. Existing local release
and cleanup evidence confirms synthetic schools archived and leads soft-deleted;
no new production customer-data read or write is needed to repeat that acceptance.
Older lifecycle/architecture/testing prose saying production acceptance is pending
is stale. Its release-record correction exists in unmerged PR #7; do not recreate
that work here. PR #7 remains a separate draft (head ff6d0da4) for search-demand
failure handling/NEXT ACTION diagnostics and release records. Its Google outcomes
runtime is identical to main. It does not fix this retry bug and is not deployed.

## Reproduced risk and selected scope

GoogleResultsClient keeps one pending POST idempotency key. If a LINE inquiry is
committed but its response is lost, registering a phone inquiry overwrites that
key; retrying LINE generates another UUID and creates a duplicate. Registering
another school's inquiry can lose it in the same way. Server upsert already
correctly deduplicates a reused school/key. Existing tests only retry the same
channel consecutively.

Keep unresolved keys per school/channel for the mounted results screen. Clear
only the acknowledged successful request's key, never unrelated pending keys.
If the saved row has since been edited to another channel or deleted, the store
returns a terminal POST 409. Retire only the matching attempted key, display the
existing conflict and require the next explicit +1; do not automatically resubmit.
Preserve existing epoch/abort guards, optional grade, saved-write/read-failure
handling and the ability to record a fresh inquiry after an acknowledged success.
Uncertain same-school/same-channel +1 is interpreted as retry, as before; its
payload does not identify an intention to create a different new inquiry.
Keys are not retained across full page reload, component unmount or a new tab.
No API/schema/migration/auth/attribution/stage semantics/dependency changes.
No customer data, credentials, external provider calls or paid services.

## Acceptance and verification

- [x] Component regression: uncertain response -> different channel success ->
  original channel retry keeps its original key. Original implementation failed
  the two new key-retention tests (20 passed); the first fix passed all 22.
- [x] Independent pending keys survive interleaved schools and channels; late
  obsolete completion cannot clear another request or update the current school.
- [x] Acknowledged success frees only that key; the next fresh inquiry gets a new
  key. Successful writes followed by read failure still invalidate stale results.
- [x] Implement the bounded client fix; existing API/store/PGlite tests unchanged.
- [x] Independent payload/concurrency review found a POST 409 recovery loop after
  editing/deleting the uncertain row. Added a failing regression (1 failed,
  24 passed), fixed terminal-key retirement, then passed all 25 component tests.
  Coverage includes 503 retention, other-channel retention and obsolete 409.
- [x] First desktop/mobile mock E2E proves duplicate-free recovery and confirmed
  save counts after reload; first aggregate passed 2,034 unit/integration and
  46 E2E. Six screenshots inspected. This is not pending-key persistence across
  reload, a live database test, or a physical mobile-device test.
- [x] Final aggregate after the review and locator fixes: typecheck, lint,
  2,037 unit/integration tests (168 files), unchanged 95% coverage gates, plain
  build and 50 E2E (25 desktop / 25 mobile viewport), all passed.
  The eight edit/delete screenshots were independently inspected: conflict and
  recovery counts match the expected channel breakdown. Full-page screenshots
  taken after scrolling can show the sticky header at that scroll position;
  operation success is established by E2E, not screenshot hit-testing.
- [x] Independent code re-review confirmed the POST 409 correction, current POST
  payload shape and epoch/signal guards; no remaining actionable code findings.
- [ ] Feature push, draft PR and exact checkout SHA/tree CI.

## Review decisions and execution evidence

POST is generated only by `add()` with channel and idempotencyKey; school is
server-authorized from the query. Period affects reads, not creation. Grade,
date, stage and existing-row channel edits use PATCH. Therefore the current
school/channel tuple covers the entire create payload; if creation gains more
fields, revisit the identity contract before extending it. Synchronous saving
guards repeated clicks, and stale epochs/aborted requests cannot release keys.

The added E2E fixture commits a synthetic row before returning 503. It uses the
existing parsing/aggregation helpers, retains soft-deleted rows for idempotency
conflicts, and models the store's channel-mismatch/deleted-row 409. Unit tests
prove key handling; mock E2E proves UI counts and school isolation. Server/PGlite
tests remain responsible for the existing database contract.

Initial aggregate failed at Prisma cache `utime` with local sandbox EPERM.
The identical command succeeded with required local cache permissions; no code,
test or coverage weakening was used. Network guards and synthetic fixture data
remain enabled. Evidence is in the task workspace's
`evidence/google-lead-retry-keys/`: component-red/green, conflict-red/green,
full-verify-sandbox-block, full-verify and full-verify-final logs.

The first expanded E2E run passed 48/50; both edit cases timed out before PATCH
because `getByLabel("経路", { exact: true })` did not match the nested label.
The observed accessible combobox name is 経路, so the locator was corrected to
`getByRole("combobox", { name: "経路", exact: true })` without weakening any
assertion. All 10 Google-results desktop/mobile cases then passed. The failed
aggregate remains in `full-verify-conflict-locator-failed.log`; the targeted
rerun is in `conflict-e2e-green.log`. The final aggregate was rerun and passed
in `full-verify-final.log` (2026-10-14).

PR #7 has no overlapping feature implementation, but its fixture/tooling/Vercel
files overlap these shared files. A future rebase must preserve both changes.
The October 13 authentication stop applies only to authentication; the October 14
inquiry-measurement development instruction remains active. No production OAuth
or production mutation is part of this task.

Before first push, disable only this exact feature branch's automatic Vercel
Git deployment and extend its existing tooling assertion. Preserve all prior
exclusions, routing, runtime and build behavior. No main merge/deploy/promote,
alias change, production DB/migration/env/secret operations in this task.

Next steps and completion evidence will be recorded here. Existing production
OAuth and Instagram issues remain separate; do not mix PR #19 or isolated work.
