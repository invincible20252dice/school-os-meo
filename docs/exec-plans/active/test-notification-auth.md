# Test notification authorization

## Objective and scope
Close unauthenticated POST /api/test/trigger-review using existing active-profile
and explicit school authorization, and send the legitimate UI session bearer.
Inspected route, trigger-review-test service, settings page/button, access helpers,
existing tests and caller searches. Only the settings UI calls this route in code;
no public survey or cron dependency was found. External callers are not verified.

## Boundaries and risks
No schema/DB migration or production changes. PR9/10 heads stay fixed. Retain
unsaved client credential input, dummy Review persistence, authorized fallback
and provider behavior; these are not solved by this change. Cross-school LINE
credential copy remains a separate pending human decision. Also retain the
Instagram/cron fail-open investigation for a subsequent task. Auth failures must
never enter the legacy send-on-error fallback. Resolve active stored profiles
without invitation writes; require an explicit body schoolId and canAccessSchool.
Missing/all school must not silently select another school's setting.

## Checklist
- [x] Identity/preflight and affected source review
- [x] Red tests for unauthenticated/invalid/pending/missing profile/cross-school and school input
- [x] Minimal route/UI implementation; authorized behavior preserved
- [x] Full codex:verify; mock desktop/mobile UI and screenshot inspection
- [ ] Commit, feature push and draft PR; exact-head CI verification

## Product decisions still pending
- Whether tests should require saved server credentials (current unsaved inputs retained).
- Whether to remove dummy Review persistence from notification tests (currently retained).
- Whether to stop cross-school LINE credential sharing (unchanged).

## Verification and release
Run isolated synthetic tests via scripts/codex-test-env.mjs then npm run codex:verify.
No real LINE, OpenAI, GBP, Supabase or customer writes. Feature preview deployment
is disabled. Merge/deploy needs separate concrete approval. TargetKeyword stays
on hold. Acceptance: rejected requests cause zero business reads/writes/AI/LINE;
allowed manager/admin calls keep existing synthetic save/send behavior; UI posts
bearer, selected school and existing unsaved LINE values. Record failures/results below.

## Implementation evidence
- 2026-10-10: TDD red 15 API + 4 UI checks; targeted green 29 tests.
- API tests use the real access resolver and notification service with synthetic
  Supabase/Prisma/AI/LINE boundaries. Active-profile mode performs only profile
  SELECT, including missing/pending/stopped cases; no invitation writes.
- Full checks before E2E: tooling, migration safety, typecheck, lint (6 existing
  warnings), 168 test files / 1997 tests, coverage 99.26% lines/statements,
  97.51% branches, 99.77% functions, plain build passed.
- Environment failures: offline npm cache lacked Vitest archive; reused a separate
  copy of installed dependencies from the PR10 worktree with identical lockfile.
  Initial E2E server listen was blocked by sandbox EPERM. Authorized retry exposed
  an unset browser-cache path (40 launch failures). Rerun uses existing
  PLAYWRIGHT_BROWSERS_PATH=/tmp/school-os-playwright and the same network guard.
- React review: session lookup runs only in the click handler; school checked
  before async work; no new effects, shared request state or subscriptions.

- Final full codex:verify passed, including 40 E2E (35.9s). Desktop/mobile
  screenshots inspected: selected B school, unsaved synthetic input and mocked
  success visible; no external request escaped fixture boundaries.
- Implementation/local verification complete. Next: feature push/draft PR and
  exact-head CI (record in PR/evidence); production review and approval remain
  separate. No product-policy decision is required for this bounded guard.
