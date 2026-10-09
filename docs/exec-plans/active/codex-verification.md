# Codex verification foundation

## Objective and boundaries

Add repeatable repository checks, isolated verification and browser regression
tests to `invincible20252dice/school-os-meo` (`meo-aio-school-saas`).
Do not change product behavior, authentication, the database schema or production.
Do not push, migrate or deploy as part of this task.

## Evidence

- Existing Vitest suites include route/component workflows and PGlite persistence.
- Existing coverage thresholds are 95%; preserve them.
- CI runs `test:ci`; reuse it through the new verification entrypoint.
- Playwright and an ESLint config are absent. Lint uses `next lint`.
- AIO uses sample responses and conflates unmeasured results with zero. Its
  desired UI states are known product gaps, not passing acceptance tests.

## Plan

- [x] Confirm origin, package, clean branch and relevant code.
- [x] Add concise repository guidance, product principles, architecture and skill.
- [x] Add tested preflight, migration safety and isolated verification runners.
- [x] Add browser tests using actual local Next.js UI and synthetic API fixtures.
- [x] Update CI and document required branch protection; do not alter GitHub settings.
- [x] Run `npm run codex:verify`, investigate failures and rerun affected checks.
- [x] Complete desktop/mobile browser execution in Linux CI (run 37889631653).
- [x] Record results, remaining product gaps and production follow-up.

## Validation and risks

Preflight must reject a wrong remote/package or missing required source files.
Migration checks must reject destructive SQL, removed/modified existing migrations
and removed/schema-breaking fields. Static checks do not certify all SQL safe.
Verification must never run database preparation/deploy/seed commands. Supply
loopback/dummy credentials, block external HTTP in tests, and use a dedicated
build directory. Browser API fixtures persist only in test memory; PostgreSQL
persistence is covered separately by existing PGlite tests.

Known AIO gaps must stay visible in reports and must not silently count as passing
end-to-end coverage. No new API spend or production records are permitted.

## Execution log

- 2026-10-09: authorized verification-branch push; full Linux codex:verify succeeded
  in run 37889631653 (1,896 Vitest cases and 24 browser cases). Earlier macOS launch
  failures below are historical. Main merge/production schema/deploy remain unapproved.
  Main required-check enforcement remains a separate repository administration task.
- Initial inspection: main is clean; origin and package match. No code edited yet.
- Added Playwright as a dev-only dependency, preserved production dependencies and
  95% coverage thresholds. ESLint runs through the existing Next core-web-vitals preset.
- Fixed preflight realpath handling after a macOS temporary-path test failure.
- Fixed two existing Instagram test files to set their own missing-env preconditions;
  no authentication/provider implementation changed.
- All 152 Vitest files / 1796 cases passed (includes two documented AIO expected
  failures); statements/lines 99.24%, functions 99.76%, branches 97.31%.
- Plain Next.js production build passed. ESLint has six pre-existing warnings.
- Browser startup is blocked by this execution sandbox: macOS MachPortRendezvous
  bootstrap_check_in returns Permission denied. No browser scenario has been verified.
  Do not waive this failure; rerun in an authorized terminal or GitHub Actions.
- Skill validator passed. No schema/data change, push, migration or deployment.
- AIO-001/002 remain known product gaps. Strict verification converts their
  expected-failure tests into normal acceptance failures.
- Final aggregate execution: preflight, six tooling tests, static migration check,
  typecheck, lint, 1796 Vitest results and plain build passed; E2E failed at browser
  startup (one failure, remaining 13 not run after fail-fast). Generated next-env
  route reference was restored without a tracked-file change.
- Strict AIO targeted execution confirmed one success-state test passes and both
  missing/error acceptance tests fail. No product fix was included in this task.
- Follow-up: in this repo run
  `PLAYWRIGHT_BROWSERS_PATH=/tmp/school-os-playwright npm run codex:verify`
  from an authorized ordinary terminal on this Mac (or install Chromium and run
  the same npm command in CI). Inspect screenshots and fix any real browser
  failures. Keep this plan active until browser verification completes.
- Before publishing workflow changes, inspect Vercel Git auto-deployment behavior.
  Configure the main branch's required Codex Verify check separately in GitHub.
