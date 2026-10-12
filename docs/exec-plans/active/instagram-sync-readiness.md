# Instagram sync readiness guard

## Scope
Separate branch codex/instagram-sync-readiness from main 67bcefc, independent of
PR #13 preview compatibility. Preserve production #11 / 25f39b1 and all aliases.
No configuration changes within this PR, migrations, row
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
- [x] PR14 review correction: TDD for implicit InstagramSetting.updatedAt absence/type/UPDATE privilege; align fixtures with Prisma writes and inspect defaults/timestamps on the two write paths. 4 red / 38 passed, then focused 89 passed. Full verification/new-HEAD CI pending below; no live operations.
- [x] TDD failures for schema/config and later-school failures with zero effects: 15 red / 1 passed, then green.
- [x] PGlite metadata/privilege/index regressions (38), normal service and auth regressions.
- [x] UI unavailable/no-op and desktop/mobile E2E; no live provider tests.
- [x] Initial 8e8ab47 full codex:verify, push/PR CI, draft PR14. Push run 38217696819 checked 8e8ab47; PR run 38217899520 checked fae4ded3df3753ef5db6f360bb5b5e7b9cc4d1c2; both passed.
- [x] Review correction full codex:verify: 175 files / 2150 tests, 54 E2E (41.3s), typecheck/lint/plain build passed; coverage 99.26% lines, 97.56% branches, 99.77% functions.
- [ ] Review correction new-HEAD push/PR CI (results recorded in PR14 to preserve exact verified source HEAD).
- [ ] Final alias verification and parent report. No merge/deploy.

Local codex:verify passed: 175 files / 2146 tests, 54 E2E; coverage 99.26% lines,
97.56% branches, 99.77% functions, typecheck/lint/plain build. Initial additional-test
parameter typing failed typecheck; corrected without changing product assertions.
PR14 remains draft. The separately approved single canonical callback addition is
complete; Google warning/consent is awaiting personal user action. No deployment authorized.

## Review correction: ORM implicit writes
The original guard omitted InstagramSetting.updatedAt. Prisma writes this @updatedAt
field even though the service only specifies lastSyncedAt. Guard now checks both
timestamp columns and UPDATE privileges; the complete PGlite fixture and minimum
runtime role include updatedAt. Negative cases cover missing column, text type and
revoked UPDATE permission.

Only two write paths exist in this service. InstagramSetting.update uses id in WHERE,
explicit lastSyncedAt, implicit updatedAt and returns id; createdAt is untouched.
SyncedPost.create includes explicit syncedAt, Prisma-generated cuid id and @updatedAt,
and omitted createdAt with schema @default(now()). Existing checks already cover
id/timestamp types and INSERT permissions. Conservatively require the database
createdAt default too; removing it now fails closed (fourth red regression).
School is read-only; no nested relation creates/updates are performed. No migration,
trigger inspection, actual Prisma transport or production write is claimed by these
PGlite catalog tests. Post-check races/constraints/provider outages remain outside
this bounded readiness guard.
