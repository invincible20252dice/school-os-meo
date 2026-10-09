# AIO Phase 3

## Scope and evidence

Keep the accepted four OpenAI results and existing schema unchanged. Reuse
RankHistory competitorData, SchoolChallenge execution history, NEXT ACTION keys
and ActionExecutionGuide. The current rankings API injects simulation data;
never call that path for AIO comparison. No live Google competitor acquisition
adapter or verified competitor snapshots were found in the inspected code.

## Plan

1. Add conservative place identity matching, freshness/source checks, per-metric
   medians and fact/judgment separation. Unknown is never zero. Limit candidates
   to three per keyword and five unique places per school.
2. Read saved snapshots and challenge completion history through existing scoped
   Prisma queries, with no provider calls, writes or challenge synchronization.
3. Reuse action keys/guides and seven-day execution exclusions; consolidate to at
   most three school-wide actions, exposing evidence and affected keywords.
4. Connect comparison, provenance, unknown fields, history details and outcomes
   links to AIO UI. Preserve provider state and successful-only denominator.
5. Unit/integration/component and desktop/mobile E2E, codex:verify, Linux CI.

## Files / risks

New aio-comparison helper/tests and comparison UI; update aio context, measurement
loader, view types, client, challenge action filter and focused tests/fixtures.
No migrations, dependencies, secrets, authentication changes or real API calls.
No duplicate competitor table. Existing unsourced data is not Google evidence.
Inspect exact identity/branch/address conflicts, stale observations, missing
history, partial metrics and duplicate action suppression in tests.

## External-data boundary

Google Places policies prohibit general indefinite content caching; place IDs
are exempt. Do not create a new data scraper or silently persist paid Places
results in RankHistory. The read-only comparison can consume provenance-bearing,
unexpired observations supplied by a separately reviewed ingestion source; it
cannot certify old rows as Google data. Live acquisition, provider credentials,
storage permission/retention and any extra API spend remain unresolved and must
be reported, not fabricated. Existing empty data remains explicitly unavailable.
Source: https://developers.google.com/maps/documentation/places/web-service/policies

## Authorization / verification

Verification branch push and CI are authorized for this Phase. No production
schema operations. Production release is distinct from real Google acceptance;
report unavailable data/provider integration explicitly and do not claim the
full live chain is complete. Batch external read checks, reuse local evidence,
and consolidate outstanding approvals rather than requesting them repeatedly.

- [x] Repository/preflight and existing pipeline investigated.
- [x] Implement and verify read-only comparison and action integration.
- [x] Linux CI and browser evidence (initial implementation, exact run below).
- [x] Document live Google acquisition blocker and release boundary in docs/aio-phase3.md.

## Local verification

Preflight, migration safety, tooling tests, typecheck, lint, unit/integration
coverage and production build passed. New comparison helper has 100% lines and
97.4% branches; global branch coverage 97.39%, without threshold changes.
An E2E fixture type omission was corrected. Local aggregate verification stops at
Playwright because Chromium headless-shell 1208 is absent, before any browser
scenario runs. This is not a browser pass. Linux CI installs the pinned browser
and must validate PC/mobile behavior and screenshots before release.

## Linux evidence

Commit `319c55445bd9ffb815eee07b9b28614b4e8980b9` passed GitHub Actions run
37907564795: 1,939 unit/integration tests, build and 30 desktop/mobile E2E tests.
No browser retry or skipped E2E. Downloaded artifact 11605176973 and inspected PC
and mobile full-page comparison plus initial-viewport screenshots; no page-wide
horizontal overflow, existing responsive header retained. All Google observations
and measurements in these screenshots are isolated fixtures, not production.

Final hardening additionally checks the school's prefecture to avoid same-named
wards in another prefecture, and gives aio-comparison its own 95% coverage gates.
The local aggregate rerun again passed through build, with the same absent-browser
limitation. Final branch CI must pass for that follow-up commit too.

## Remaining acceptance gate

There is still no live Google competitor acquisition source in the existing
pipeline. No production DB/API read or write, paid measurement, main merge or
deployment was performed for this Phase 3 task. A real-data Google acceptance
run cannot be reported complete until source/credentials/storage terms/cost are
settled and ingestion is implemented. Do not merge simulated or legacy numeric
data into the comparison to bypass this gate.
