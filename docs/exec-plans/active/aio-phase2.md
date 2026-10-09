# AIO Phase 2

## Objective and authority

Extend the accepted OpenAI pilot into sequential active-keyword measurement,
latest-success-denominator summaries, real history, evidence-backed competitor
candidates and existing-guide NEXT ACTIONS. Phase 1 succeeded in production on
2026-10-09 (one recommendation-negative measurement). Preserve it unchanged.
This task authorizes verification-branch pushes only. No production deployment,
production API measurement, schema mutation, main merge or Cron activation.

## Inspected boundaries

aio-provider/measurement/view, authenticated dashboard/aio route and client,
AioMeasurement and TargetKeyword, dashboard-rankings competitorData,
challenge-next-actions and action-guides, PGlite integration tests, E2E fixtures,
quality workflow and deployment exclusions. Keep existing direct Responses API,
model, timeout, authentication, approved admin/school boundary and daily budget.

## Design / files

- Add aio-insights and aio-audit helpers/tests for transparent summaries, histories,
  conservative quoted competitors, existing guide actions and usage metadata.
- Update aio-provider, aio-measurement, aio-view and route/tests. Sequential
  browser requests, transaction reservations, per-keyword 10-minute deduplication,
  school-wide running lock, unchanged five paid attempts per rolling 24 hours.
- Add a read-only school/competitor context loader; do not reuse challenge loading
  paths that synchronize external services. Exact-name saved comparisons only.
- Update AIO client/CSS/component and browser tests. No new dependency required.
- Add the verification branch to Vercel's no-deploy list and update tooling tests.

## Data / cost / risks

No schema or migration changes. Existing measurements and legacy samples remain.
Only new measurement reservations are completed; remeasurement creates new rows.
Use existing citations JSON as a versioned envelope for new request usage metadata;
read legacy citation arrays without rewriting. Explicit real source allowlist.
History shows up to the latest 50 attempts per keyword and declares truncation.
Retain the current one search + optional brand-classification request (max two),
with no extra competitor-generation spend. Competitor extraction is conservative:
only explicitly recommended prep/cram schools with verbatim evidence; unknown is
unknown and no causal ranking claims. Old records have unknown cost.
API failures, partial batches, ambiguous competitors, stale comparison snapshots,
and transport interruption must be visible, never successful zero.

## Progress

- [x] Identity/preflight and existing implementation inspection.
- [x] Failing behavior tests, implementation and focused verification.
- [x] Local codex:verify through build (1,914 tests on second run); local E2E
  blocked by missing Chromium executable. Linux browser evidence still pending.
- [ ] Verification branch push, Linux CI/E2E and safe repairs.
- [ ] Report actual results and request production deployment approval.

## Acceptance

Four synthetic keywords exercise all-success/mixed error denominators, sequential
requests and reload; unchanged prior pilot remains readable; duplicates cannot
spend again; later genuine remeasurement appends; history has zero/one/many points;
non-competitor entities and ungrounded actions are excluded; successful recommended
keywords have no actions; approved school isolation and secrets are preserved.
Run npm run codex:verify with isolated credentials. Live Phase 2 acceptance remains
a separate, approval-gated Vercel runtime operation after CI success.

## Verification observations

- Initial aggregate gates passed; Linux initial browser run passed 26/28. Two
  screenshot-flow assertions checked image pixels before loading completed.
  Replaced that immediate assertion with a bounded Playwright poll; no gate skipped.
- Read only the already accepted production answer (one response field, no secrets
  or writes). Its bold linked place-result format required an additional extraction
  case. Added a failing synthetic format regression, then implemented and passed it.
- Versioned JSON retains legacy arrays. Existing SQL/schema unchanged; no database
  or provider writes have been made in this Phase 2 task.
- Linux run 37896065355 passed on d920275: 1,916 tests, 28 desktop/mobile E2E,
  99.24% lines / 97.39% branches, typecheck/lint/build. Screenshots inspected.
  Final additions (place-result extraction regression, dated chart and two-day
  browser history case) require the next commit's full CI before approval.
