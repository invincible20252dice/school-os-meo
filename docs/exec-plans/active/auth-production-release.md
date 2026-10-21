# Auth-only production release

**Paused after rollback (2026-10-13):** PR #18 merged as `b9867de`, but live
acceptance was **observation-insufficient / unjudged**, not a confirmed auth
failure. Both aliases now use stable `25f39b1`. The current authorized work is
[main/stable alignment](../completed/main-stable-alignment.md): preserve the PR #12 exclusion,
isolate the unjudged canonical/logout code, verify a draft PR, then stop before
merge/deploy. Historical release permissions below are not permission to resume
OAuth or republish these changes.

## Scope and authority
User approved a single release PR from current main, reverting PR #12 and applying only PR #15 canonical Google login and PR #16 local logout/session gate. Independent review must pass before merge. Full CI/E2E and stable rollback verification are prerequisites. No reset/force push, DB/migrations, env/secrets, scopes, Site URL, temporary callbacks, candidate OAuth or Instagram repairs.

## Baselines and inspected behavior
- main: 67bcefc6b8ea6b7b7b276738ff494d25871cce3e (merge #12).
- Stable production: 25f39b138684dd67c652d7fba345fb6c9cc5c29f (#9–11 preserved).
- #15: 7e50d90457bfd418c3157724905f3b018f148f21; exact approved browser-origin selection only.
- #16: a86d3919a8002b54cb7b73f2c1eadd7980c24e31; local-scope signOut, session check, dashboard unmount/re-entry guard.
- #17 deployment-origin opt-in is excluded entirely; no policy endpoint or VERCEL_URL trust.
- Inspected AGENTS/product/development rules, architecture/testing, auth helper, dashboard gate, #12 manual/cron auth changes and verification tooling.

## Implementation and risks
Revert #12 as part of this same release, never merge its revert alone. This intentionally restores stable Instagram behavior, including known manual authorization/cron fail-open gaps; do not call these endpoints. Instagram preview, missing DB columns, manual authorization, cron fail-open remain separate work. Reuse existing reviewed auth commits and tests. Only release-branch preview-disable metadata and matching tooling expectation may accompany auth/docs. No external writes in tests.

## Checklist
- [x] Revert #12 and prove stable source restored before applying auth.
- [x] Integrate #15/#16, exclude #13/#14/#17, review stable/main diffs.
- [x] Verify rollback deployment exists, READY, source SHA matches stable; domains unchanged.
- [ ] Full codex:verify: typecheck/lint/unit/integration/coverage/build/desktop + mobile viewport E2E.
- [ ] Draft release PR and exact HEAD/merge CI success.
- [ ] Independent review; no merge until received.
- [ ] Conditional main merge and formal main deployment, READY/SHA/alias verification.
- [ ] Canonical real OAuth 13-step acceptance (human Google warning when needed); immediately rollback on failure.

## Acceptance and remaining work
Fixture-backed E2E is distinct from real OAuth and real phone. No production secrets or customer payloads in evidence. Keep rollback target dpl_48Erde1hQPKvorWUmgciC7CY9ZH1 (verify source SHA 25f39b1; user spelling discrepancy resolved by actual metadata). After successful canonical acceptance, close authentication and track the four Instagram issues separately.

## Source proof and rollback inspection (2026-10-13)
Revert-only commit c9dc575 restores every tracked preexisting file to stable 25f39b1 (new plan excepted). PR15 and PR16 application/test files match their exact reviewed commits byte-for-byte. Stable diff is limited to auth/logout, related tests/docs, and one release-branch preview-disable entry plus matching tooling assertion. Main diff additionally removes #12. Schema, package/lockfile, workflows and all API routes match stable. Existing non-auth VERCEL_URL use in LINE remains stable behavior; no candidate auth policy is present.
Vercel GET deployment: dpl_48Erde1hQPKvorWUmgciC7CY9ZH1 READY, gitSource.ref=main, gitSource.sha=25f39b138684dd67c652d7fba345fb6c9cc5c29f. GET project confirms productionBranch=main and autoAssignCustomDomains=false. No setting edits performed. Promotion after independent review must use the formal main deployment, never the candidate.

## Verification in progress
First aggregate: typecheck/lint/coverage/plain build passed (170 files, 2068 unit/integration cases; unchanged lint warnings). E2E failed before executing test steps because the new checkout did not specify existing Chromium cache /tmp/school-os-playwright. No application failure or test weakening. Repeat the entire aggregate with PLAYWRIGHT_BROWSERS_PATH=/tmp/school-os-playwright; final exact-commit results will be recorded in PR/evidence after completion.
Application and E2E files also exactly match prior combined auth candidate a5790af; #17 is absent. React checklist: event subscriptions are cleaned up, stale approval responses invalidated, logout errors preserve a safe retry and withhold protected children; unchanged server API boundaries remain responsible for authorization.
