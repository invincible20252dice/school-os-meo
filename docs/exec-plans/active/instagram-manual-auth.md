# Instagram manual sync authorization

## Approved production safety scope — 2026-10-12
User approved staged #9–#12 release, including fail-closed cron and bounded SSR
preview safety fixes. Main now 25f39b138684dd67c652d7fba345fb6c9cc5c29f (#9–#11).
Production READY/alias and safe unauthenticated smoke confirmed for #11; rollback
target dpl_48Erde1hQPKvorWUmgciC7CY9ZH1. Live positive role checks remain pending
existing test-admin login; mocks are not counted as live authorization evidence.

Cron missing/blank secret must reject before service calls; configured bearer
normal behavior remains. No secret inspection/change. SSR currently queries DB
before authentication, and mock formatter can call configured OpenAI. Move its
school reads to an active-profile, explicit-school authorized read-only endpoint;
render only shell before browser bearer authentication. Reuse existing auth/role
helpers, keep preview layout/manual-sync behavior, and use pure local formatter.
No broad auth redesign, schema/data changes, provider effects or new billing.
Add denial/ownership/zero-provider tests and browser fetch/error/selection coverage.
Preserve all accumulated E2E and Preview-disabled branches. Full cumulative verify
and exact checkout CI required before main merge; production smoke never syncs.

Validation: cron/mock safety red 3 failed/6 passed; SSR unauthorized-read regression
red 1 failed. After fixes, safety/preview API/SSR 33 tests and client 4 tests passed.
Full cumulative codex:verify passed: 173 files / 2085 tests, coverage 99.25%
lines/statements, 97.55% branches, 99.77% functions, typecheck, lint (existing six
warnings), plain build and 52 desktop/mobile E2E (40.6s). Inspected desktop 200
preview and mobile 403 screenshots. No real provider or DB access. Explicit all
scope still works for authorized admin manual sync; preview requires one school.
Parent requires independent review of this updated head before merge, in addition
to CI. This is a review gate, not a new production authorization request.

## Objective / scope
Close unauthenticated POST /api/instagram/sync before any business query or
Instagram/AI/GBP call. Reuse active stored-profile authentication, approval and
canAccessSchool. Pass the selected school unchanged after authorization; never
silently substitute the manager's default school. Add session bearer to the
existing button. Preserve active admin all-school operation (all or omitted).
General users must provide one explicit assigned school; missing is 400, all or
unassigned is 403. No role or membership expansion.

## Revalidated 2026-10-12
Mac execution restored. All existing worktrees clean. GitHub main still
077f147be1a78b1ab7ac0d56d5c722f568ac7fa6. PR9 06851b2, PR10 d61ba44,
PR11 ba9ff4f remain draft/open and unchanged. New worktree/branch independent
from those PRs. Read AGENTS/product principles/development rules/architecture,
verification skill, route/UI/service/cron/tests and relevant Prisma models.

## Callers and boundaries
Only InstagramRealSyncButton on dashboard/instagram-sync calls the manual API.
Existing role helpers/admin scope permit all-school sync; preserve this for
active stored admins. Cron calls syncInstagramPosts directly through its separate
route and service bearer; leave cron and common sync service byte-for-byte intact.
No public survey dependency found. Actual external schedulers are unverified.
No schema, migration, production write, secret retrieval, API scope, paid call,
merge or deployment. Tests use synthetic auth/Prisma/Instagram/AI/GBP boundaries.
Preview deployment disabled for this feature branch before push.

## Checklist
- [x] Identity/preflight and affected-source review
- [x] TDD denial/scope/allowed admin+manager and unchanged cron behavior
- [x] Minimal manual route and button changes
- [x] Full codex:verify, desktop/mobile mock E2E and screenshots
- [ ] Feature commit/push/draft PR and exact-checkout CI evidence

## Acceptance / validation
Denied no-bearer/invalid/pending/inactive/missing-profile/cross-school requests
must perform zero business reads/writes and zero Instagram/AI/GBP calls. Profile
resolution must not apply invitations or metadata-based admin elevation. Authorized
single-school requests touch only the exact school; authorized admin all-school
requests keep both enabled settings. Authorized cron still processes all schools
without user auth. UI sends bearer and requested school; expired session sends
nothing. Run isolated targeted tests, then codex:verify; inspect real checkout SHA
in push and PR CI logs. No production fixtures are activated.

## Separate pending risks / decisions
- Cron CRON_SECRET-unset fail-open unchanged; scheduler configuration unverified.
- SSR Instagram preview loads data without this route guard; its mock formatter
  can call OpenAI when configured despite the UI safety wording. This existing
  read/preview path is not fixed or certified safe by the manual POST guard.
- LINE cross-school copy and notification product decisions remain pending.
- TargetKeyword GRANT remains unexecuted/HOLD. Profiles work is already completed.
- Release/integration with PR9-11 needs separate PM approval and verification.

## Execution record
- TDD before implementation: 13 failed / 9 passed (22 new tests).
- Targeted after implementation: 39 tests / 5 files passed, including existing
  cron and common-service regression tests.
- First aggregate run stopped at typecheck: test mock returned Promise instead
  of PrismaPromise. Fixed the synthetic boundary mock typing; no application
  behavior change or weakened assertion. Full aggregate rerun passed.
- Dependencies copied independently from the existing PR11 worktree after
  identical package-lock comparison; no dependency update or source mutation.

- Final codex:verify passed: tooling/migration checks, Prisma generation,
  typecheck, lint (6 existing warnings), 168 files / 2000 unit tests,
  coverage lines/statements 99.25%, branches 97.51%, functions 99.77%, plain
  build and 42 desktop/mobile E2E (38.1s).
- Inspected desktop single-school and mobile all-school screenshots: button and
  mocked success visible. Preview remains legacy sample content, not a claim
  of school data/provider correctness. No external fixture request escaped.
- Next: draft PR / exact-checkout CI record, then PM review. Release is unapproved.
