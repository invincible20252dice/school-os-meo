# Instagram sync readiness guard

## Scope
Separate branch codex/instagram-sync-readiness from main 67bcefc, independent of
PR #13 preview compatibility. Preserve production #11 / 25f39b1 and all aliases.
No configuration changes (canonical callback approval pending), migrations, row
updates, grants, credential migration, actual provider calls, merge or deployment.

## Inspected behavior and risk
Manual route authenticates active profile/school; cron independently checks its
secret. Both call instagram-sync.ts. Existing service reads all settings fields,
fetches Instagram, may call AI, posts GBP, inserts SyncedPost, updates lastSyncedAt.
Missing schema/config can fail after effects. Current production lacks four
InstagramSetting columns; SyncedPost columns/unique index and School.gbpLocationId
exist. Credentials/config validity and safe test destinations are not established.

## Minimal implementation
- Shared service preflight: one read-only metadata query using the application DB
  role checks required read/write columns/types/privileges and exact valid unique
  indexes; errors/unknown metadata fail closed, no schema changes.
- Read only fields required for sync; validate endpoint and every selected school's
  required nonempty values before the first provider call. Optional GBP bearer stays
  optional for existing relay compatibility. Select id only from write results to
  avoid unrelated legacy fields. Do not map old column names or copy secrets.
- Return safe unavailable error to manual/cron; UI says 同期利用不可. Keep 401/403
  behavior and configured cron separate. Generic logs never print caught errors.
- No enabled settings / no posted items is a no-op, never claimed as real sync.
  Normal configured-schema flow remains covered with isolated provider responses.

## Limits
Readiness checks do not make SQL and GBP atomic or remove post-check races/outages.
No automatic retry/reconciliation mechanism or large auth/provider redesign here.
Preview success is independent of readiness. Live acceptance remains blocked by
canonical callback/base URL alignment, schema compatibility and approved disposable
provider targets/budget. Existing archived fixtures have no Instagram/GBP setup.

## Checklist
- [x] TDD failures for schema/config and later-school failures with zero effects: 15 red / 1 passed, then green.
- [x] PGlite metadata/privilege/index regressions (38), normal service and auth regressions.
- [x] UI unavailable/no-op and desktop/mobile E2E; no live provider tests.
- [ ] Full codex:verify, push/PR CI with actual checkout SHAs, draft PR.
- [ ] Final alias verification and parent report. No merge/deploy.

Local codex:verify passed: 175 files / 2146 tests, 54 E2E; coverage 99.26% lines,
97.56% branches, 99.77% functions, typecheck/lint/plain build. Initial additional-test
parameter typing failed typecheck; corrected without changing product assertions.
On explicit user steering, implementation is preserved locally while the separately
approved single canonical callback addition and authentication verification take
priority. Feature push/PR/CI are not completed yet. No deployment authorized.
