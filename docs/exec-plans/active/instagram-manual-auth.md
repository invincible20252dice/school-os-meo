# Instagram sync and preview authorization

## Superseding production outcome (2026-10-12)
#12 merged as 67bcefc and reached READY, but authenticated preview returned 500
because the production legacy InstagramSetting schema lacks lastSyncedAt. Rolled
back to stable #11 / 25f39b1 / dpl_48Erde1hQPKvorWUmgciC7CY9ZH1; both aliases verified.
Do not republish #12. Follow-up implementation, tests and live acceptance blockers
are tracked in [preview compatibility](instagram-preview-compat.md). Later historical
release-candidate statements below are not the current deployment state.

## Current approved scope — 2026-10-12
User approved staged #9 → #10 → #11 → #12 production release. Current base is
25f39b138684dd67c652d7fba345fb6c9cc5c29f (#9–#11 deployed); READY and
app.jukumeo.com alias verified. Prior stable deployment / rollback target:
dpl_48Erde1hQPKvorWUmgciC7CY9ZH1. No customer-data, schema, secret, billing or
broad authentication changes. Production smoke must not send notifications or sync.

## Implemented behavior
- Manual POST requires authenticated active stored profile. General users must
  explicitly select an assigned school; missing is 400, all/unassigned is 403.
  Preserve exact selected school, including second assignment. Active admin
  all-school scope (all/omitted) remains. UI supplies session bearer.
- Cron rejects missing/blank CRON_SECRET before service calls. Configured valid
  bearer behavior remains. Secret value/settings were not read or modified;
  actual external scheduler configuration remains unverified.
- SSR renders only a shell without school-data or AI calls. Browser bearer auth
  retrieves a read-only preview through active-profile/explicit-school guards.
  Missing/inactive school is 404; lookup failures do not fabricate success.
  School changes discard stale responses. Preview requires one selected school.
- Preview uses the existing pure local formatter, not external AI, even with an
  API key configured. The panel is labeled ローカル整形サンプル. The common real
  sync service and its AI behavior remain unchanged from production base.
- All accumulated Google/LINE/notification/manual-sync E2E and disabled feature
  Preview entries are retained. No public survey dependency was changed.

## Verification and review
- Original manual-auth TDD: 13 failed/9 passed; targeted green 39 tests.
- Added safety TDD: cron/mock 3 failed/6 passed; SSR regression 1 failed.
  Green safety/API/SSR 33 tests and browser-client 4 tests.
- Cumulative codex:verify on 5984d4f passed: 173 files / 2085 tests, coverage
  99.25% lines/statements, 97.55% branches, 99.77% functions, typecheck, lint
  (six existing warnings), plain build and 52 desktop/mobile E2E (40.6s).
  Desktop successful preview/mobile denied preview screenshots inspected.
- Push CI 38210300276 checked out 5984d4f2adbe969bf63b7883c057f2c9ede1d298;
  PR CI 38210304516 checked out synthetic 0a81b97689933f8895a275286bda89e4580af640.
  Both passed 2085 tests / 52 E2E; actual checkout verified in job logs.
- Parent independently reviewed 5984d4f and found no issue. Only preview label
  and this plan clarification were requested before release. Rerun affected
  checks/full verify and exact new-head CI before merge.
- Tests use synthetic auth/Prisma/providers. Live authorized manager/admin paths
  are NOT verified by mocks. User selected an existing test-admin login but
  completion is pending; general-user live verification remains pending too.

## Release checklist
- [x] Identity/preflight, source review and cumulative integration
- [x] Manual auth, cron fail-closed, SSR/preview safety implementation
- [x] Full cumulative verification and independent review of 5984d4f
- [ ] Label/documentation follow-up: new-head verification and CI
- [ ] Merge and production SHA / READY / app.jukumeo.com confirmation
- [ ] Safe production smoke; track authenticated-role checks separately

## Remaining risks / follow-up
- Existing sample content/location defaults are preview material, not measured
  results. Actual provider availability and configured cron scheduler unverified.
- Authorized LINE secret fields and legacy notification/dummy-review behavior
  remain separate follow-ups. LINE GET cross-school copying was removed in #10;
  previously saved customer settings were not rewritten.
- TargetKeyword GRANT remains unexecuted/HOLD. Profiles work was completed.
- If production fails, restore the immediately prior stable deployment and stop;
  no main reset or force push. Do not change customer data for smoke tests.

## Historical scope (superseded, retained for context)
The initial manual-only PR based on 077f147 deliberately left cron and SSR
unchanged, and release was not then authorized. It passed 2000 tests / 42 E2E.
The later explicit production approval required cron/SSR safety before #12 and
supersedes those earlier exclusions. Only the common sync service remains
unchanged; cron and preview are now fixed as described above. PR9–#11 were
subsequently integrated and deployed in order. The first manual-only aggregate
run found a synthetic Prisma mock Promise typing error; it was fixed without
weakening assertions. No such failure remains in the cumulative verification.
