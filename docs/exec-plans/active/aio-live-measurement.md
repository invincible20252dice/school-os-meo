# AIO live measurement, single-provider gate

## Scope and safety

School OS only: invincible20252dice/school-os-meo.git. No production push,
deployment, migration application, reset or deletion. Existing local changes stay.
Required live credentials: OPENAI_API_KEY and DATABASE_URL. DIRECT_URL is unused.
Vercel metadata now confirms both variables exist as Secret. They remain in the
Vercel runtime: no local pull, copying or secret extraction. The previous local
credential/nonproduction requirement is superseded by the user's latest instruction.
Use the existing production Supabase project, but do not change its schema or deploy
until explicit approval of this rollout. Never copy ai-tutor credentials.

## Vercel-only pilot revision

Linux CI run 37888542388 reached tooling checks (7 passed) but Prisma generate
needed a fresh Linux engine download, blocked by the verification network guard.
The workflow now installs only @prisma/engines binaries before isolation, alongside
browser/dependency preparation. No application install hook or DB command runs.
Network blocking inside codex:verify remains unchanged; a tooling regression check
requires this ordering and forbids production secrets/migration/deploy commands.

Run 37888706224 passed typecheck, lint, unit/integration coverage and build. Linux
Chromium launched; login E2E found the production background image was unmocked.
The exact known image URL now receives a local static fixture, with all other
external requests still blocked. Run all browser cases rather than fail-fast so
remaining independent failures can be diagnosed together; no assertions are skipped.

Run 37888983596: 10/24 browser tests passed. Artifacts show saved/failed-save draft
values were intact; use textbox accessible names instead of label text containing
controlled textarea content. Scope alerts to main (exclude Next route announcer),
and match the actual /api/dashboard/reviews endpoint in fixtures. Mobile artifacts
also exposed a real header defect: hidden label text removed the school select's
accessible name and fixed widths caused horizontal overflow. Add stable aria-labels
and wrapping responsive tracks; E2E now asserts no horizontal overflow as well.

2026-10-09 continuation: no production approval inferred from "continue development".
Removed a leftover bulk update of stale RUNNING records. Added red/green unit and
PGlite preservation checks plus E2E assertions for 100%, read-only access, and
disabled measurement after success/failure and reload. SQL/schema are unchanged.
Verification: 157 files / 1,896 tests, tooling 7, typecheck, lint (0 errors, 6 prior
warnings), build and migration safety passed. Aggregate codex:verify stopped at
the E2E server's localhost listen permission. After network permission was granted,
the E2E-only retry started its server but Chromium hit MachPortRendezvous 1100:
1 launch failure, 23 tests not run. No browser acceptance or Linux CI pass claimed.
The user approved a verification-branch push on 2026-10-09. Work now proceeds on
codex/aio-linux-verification; main merge, production SQL and deployment are not approved.
This branch disables Vercel Git deployment to prevent Preview runtime side effects.
Linux Actions uses isolated credentials and fixtures only. Real execution still awaits
concrete approval. The preservation test failed before the bulk-update removal and
passed after it; an isolated PGlite test also confirms the older row is unchanged.

- [x] Read-only production audit: School 5, TargetKeyword 4, AioScoreHistory 0;
  AioMeasurement and public._prisma_migrations absent. No application data changed.
- [x] Admin-only POST, exact school/keyword IDs and server-fixed request ID.
  Multiple tabs/retries reuse the same reservation even after failure/interruption.
- [x] Separate reviewed Supabase SQL with bounded lock/statement timeouts.
  No Prisma migrate deploy/reset/db push or blanket Supabase db push is permitted.
- [x] Remove database preparation from Vercel build paths; regression-test that rule.
- [x] Scope/permissions/one-shot UI and SQL persistence tests added.
- [x] Run full codex:verify for this revision and record actual results (E2E blocked).
- [ ] User approval, then schema application and Vercel deployment.
- [ ] Authenticated production browser pilot and reload acceptance.

See [production pilot runbook](../../aio-production-pilot.md) for exact SQL,
approval gates, schema differences, effects and non-destructive rollback.

Latest revision verification: 7 tooling tests; 157 Vitest files / 1,891 tests;
typecheck, lint (0 errors, 6 existing warnings), static migration safety and build
passed. Coverage statements/lines 99.24%, branches 97.37%, functions 99.76%.
The old build-SQL expectation was updated to require no automatic database mutation.
New read-only authorization tests failed first, then passed after the opt-in fix.
E2E first lacked the default browser path; reusing /private/tmp/school-os-playwright
resolved that issue but Chromium still failed MachPortRendezvous permission 1100.
Final codex:verify therefore exited nonzero at E2E (1 launch failure, 19 not run).
No Linux CI result, production SQL application, deployment or real measurement.

## Design

- Implement one explicit keyword per manual request with OpenAI Responses web_search.
  This measures an OpenAI API search answer, NOT the public ChatGPT UI.
- gpt-4.1-mini, forced web search, cited completed answers only. Brand detection uses
  normalized school-name matching. A separate structured classifier judges explicit
  recommendation with a verbatim quote containing the school name. No whole-answer
  sentiment scoring. Store algorithm version and evidence; classification is AI-assisted.
- New AioMeasurement records, separate from legacy sample AioScoreHistory.
  Status RUNNING/SUCCESS/FAILED/CONFIG_REQUIRED; nullable metrics for non-success.
  DB enforces school/keyword tenancy. Preserve old data unchanged.
- Existing bearer authentication, approval and school permissions on GET/POST.
  Idempotency + school-level transactional reservation, cooldown and daily cap.
  No automatic provider retries; at most two model requests per measurement.
- UI reads the latest attempt for the selected keyword. Failure is never successful
  zero; no aggregate/history/competitor chart is fabricated. Other providers unsupported.
- Disable legacy sample Cron execution until real manual verification is evidenced.
- Keep unit/SQL/UI tests synthetic and isolated. codex:verify is NOT live verification.

## Official references (checked 2026-10-08)

- https://developers.openai.com/api/docs/guides/tools-web-search
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.google.com/search/docs/appearance/ai-features

Google AI scope is AI Overview, not AI Mode. No supported retrieval integration is
configured here; do not substitute Gemini API or claim public Google measurement.
Gemini implementation is deferred until the single-provider gate passes.

## Steps

- [x] Verify repository and inspect auth, schema, provider, UI and test boundaries.
- [x] Write failure/zero/config/success provider tests first (red, then green).
- [x] Add model/migration, bounded provider and authenticated manual API.
- [x] Replace AIO UI and retire sample Cron path.
- [x] Exercise SQL persistence, API authorization and UI remount with synthetic data.
- [ ] Execute browser reload acceptance in Playwright (fixtures).
- [x] Run codex:verify; investigate failures without weakening gates (E2E environment blocked).
- [ ] Verify schema application and Vercel deployment have explicit approval.
- [ ] Real keyword/provider -> result -> DB -> reload -> UI. Record evidence without secrets.
- [ ] Only after that gate: multiple keywords, additional providers, history,
      competitors and then Cron. These are NOT complete in the initial slice.

## Blocking and resumption

Credentials stay inside Vercel. Production schema/deploy approval is the current
gate, not local secret availability. Never apply migrations automatically on a
heartbeat. After approval use only the pinned school/keyword and one reservation.
Periodic checks stay quiet when unchanged and never repeatedly spend API quota.

## Verification evidence (2026-10-08)

- Final codex:verify: identity and migration static checks, tooling, typecheck,
  lint, 157 Vitest files / 1,874 tests, coverage and build passed.
- Coverage: statements/lines 99.24%, branches 97.36%, functions 99.76%.
  New provider, persistence service and AIO API measured at 100%.
- E2E: Chromium denied macOS MachPortRendezvous bootstrap access (1100);
  one launch failure and 19 tests not run. This is NOT an E2E pass.
- Linux GitHub Actions is configured to install Chromium and run codex:verify.
  No push or deployment was made, so there is no CI result for these changes.
- Fixed the new CSS compatibility warning and a parameterized-test TypeScript
  tuple error. An auxiliary coverage command accidentally used NODE_ENV=production;
  rerunning through the normal runner restored NODE_ENV=test and all tests passed.
- SQL migration executed only in fresh in-memory PGlite. RLS enabled without
  browser-role policies; the server DB role must have appropriate access.
- OPENAI_API_KEY and DATABASE_URL remain absent locally. DIRECT_URL is not a blocker.
  No live API or database measurement has passed. Never interpret isolated tests
  or the local preview as live success.
- Hourly thread heartbeat school-os-aio now checks approval state, not local secrets.
  No-change checks stay quiet. No production schema/deploy without explicit approval.
- Rollout still requires live pilot proof, Linux E2E evidence, legacy overview/report
  consumer migration, then multi-keyword/provider/history/competitor/Cron work.
