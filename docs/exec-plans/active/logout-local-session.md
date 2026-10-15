# Local-session logout from current main

Current status: LOCAL VERIFIED. Earlier blocked findings below are resolved.
Push/draft PR remain held for branch deployment-suppression approval.

Base: fdca0da5229193acf9c592522c5ec23278f37e80 (PR21). Dedicated worktree and
codex/logout-local-session branch. No old branch cherry-picks.

Scope: header signOut({scope:'local'}), successful completion before recovery
cleanup and location.replace('/login'), retryable failures and duplicate guard.
Existing AuthApprovalGate returns on absent session, so direct dashboard/settings
and browser history need a small client rendering boundary. Server authorization,
approval/profile rules, OAuth/callback, credentials, DB and recovery semantics stay
unchanged. This is browser UX; existing bearer authorization remains authoritative.

TDD: component regressions first; real installed Supabase SDK with synthetic local
Auth endpoints and isolated storage; browser fixtures must seed once only. Cover
admin/general, session/storage removal, reload/direct URLs/back, re-login/reload,
repeat logout, error/rejection and duplicate clicks. Keep all 95% gates and PR21
coverage. Run aggregate codex:verify, desktop/mobile screenshots, independent review.

Deployment gate: vercel.json lacks this branch. Parent explicitly says do not edit
settings; push/PR remain held pending user approval. No deployment/alias/live OAuth.

- [x] Record RED, implement minimal fix
- [x] Complete local aggregate and independent review
- [x] Report diff and evidence; hold settings/push/PR

## Local outcome: BLOCKED, not release-ready

2026-10-15: RED: Header 3 failures, Gate 4 failures/1 baseline pass. Initial
implementation calls local signOut once, clears recovery only on resolved success,
and uses location.replace; rendering boundary prevents unauthenticated direct URLs
and hides browser-history snapshots. No settings/SDK/package-lock changes.

Independent read-only review found P1: fixed supabase-js/auth-js 2.110.8 clears
local session/storage and emits SIGNED_OUT even when logout endpoint returns 503,
then returns error. Existing PR21 Guard reacts by deleting recovery metadata; the
new Gate unmounts Header, losing its catch/error/retry UI. Real SDK reproduction
and real-browser local mocks confirm this. Header mocks alone cannot prove failure
behavior. Do not restore SDK storage manually, change SDK version or redefine
failure as success to conceal this. Further coordination of logout failure UI,
PR21 disposal, and already-removed local session needs a reviewed design decision.

Validation:
- Initial aggregate stopped at new-test TypeScript annotations; fixed them.
- Aggregate attempt 2 passed tooling, migration check, generation, typecheck,
  lint (6 existing warnings), all 2,190 tests/175 files, coverage and plain build.
  Coverage statements/branches/functions/lines 99.27/97.50/99.78/99.27%; gates intact.
- Aggregate E2E: 96 passed / 2 failed (48 pass + 1 fail in each viewport).
  All inherited 92 cases, including PR21 recovery and Google login start, passed.
- Final focused Gate/Header suite: 13 passed (5 additional failure/cleanup cases).
  Final typecheck passed before the last failure-E2E evidence enhancement.
- Final real-SDK E2E: 4 success flows passed (admin/manager x desktop/mobile),
  2 503 failure flows failed. Enhanced failure uses a real PR21 uncertain operation:
  recoveryBefore populated, recoveryAfter null, session null, URL unchanged,
  errorVisible false. Failure is left RED, not skipped or weakened.
- Success flows prove local scope, SDK storage/getSession absence, preserved
  unrelated storage, reload unauthenticated, dashboard/settings direct redirects,
  browser back, SDK password re-login/reload and refresh, repeat logout.
  Password/token endpoints are synthetic fixture login, not a production login
  method change. Existing callback helper unit tests pass; live OAuth/callback,
  real other-device revocation semantics and production BFCache are not certified.
- Independent review: P1 above remains open. No other major finding. Screenshot
  inspection confirms mobile login on success and blank failure UI.

Evidence is outside the repository at ../logout-local-evidence/: RED logs,
verify-2.log, focused-final.log, sdk-error.json and reproduction script,
aggregate reports, final logout browser report and browser-observations.json.
HEAD remains base fdca0da5229193acf9c592522c5ec23278f37e80; changes uncommitted.
No PR/CI/push/merge, new deployment, alias, settings, real OAuth, DB/data operation.
Next: PM decision on the SDK failure contract and permitted logout-only coordination;
fix, fresh full verification/review, then separately resolve branch deployment
suppression approval before push/draft PR. Do not use the old candidate deployment.

## Resumed with parent authorization: minimal logout coordination

The previous blocked result is historical and superseded by this follow-up.
Parent explicitly authorized solving the failure contract with logout-only state
coordination while keeping SDK storage, dependencies and auth models unchanged.

- Added document-local WeakMap operation phase; synchronous pending publication
  before calling SDK. A shared guard prevents concurrent/repeated successful runs.
  Only SDK success permits recovery removal then history-replacing login navigation.
- Gate unmounts customer UI for pending/failed operations and keeps a safe retry
  panel on the same URL even when SDK has already removed session. Retrying always
  calls SDK local signOut; without a session SDK succeeds without another HTTP call.
  No token retention, manual auth API calls or SDK storage restoration.
- Guard and inquiry client defer null-session disposal only for explicit logout;
  different-user/school/route/expiry cleanup is unchanged. Existing operation
  generations plus logout phase reject late inquiry responses and automatic resend.
- Completed-logout history restoration replaces login again (independent review P2,
  regression RED recorded before fix). P1 and P2 independently reviewed as resolved.
- Fixed SDK source and official https://supabase.com/docs/guides/auth/signout checked.
  SDK integration test records HTTP503 -> SIGNED_OUT -> returned503, session/storage
  absent, recovery cleanup uncalled until SDK retry succeeds. Official docs define
  local scope; the exact error ordering is evidence from pinned 2.110.8 source/tests.
- Aggregate attempt 3 passed all 2,204 tests, coverage/typecheck/lint/build and 100
  E2E (50 per viewport). Final aggregate repeats after adding SDK-order integration,
  completed-history regression and late successful inquiry completion coverage.
- No settings, push/PR, deployment, alias, real OAuth, DB/data or lockfile change.


## Final local acceptance

Final aggregate attempt 4: PASS, 2,206 tests across 177 files, coverage
99.27/97.50/99.78/99.27%, typecheck, lint (6 inherited warnings), plain build,
tooling, migration safety and 102 E2E (51 desktop / 51 mobile). All inherited
92 E2E remain passing. No coverage threshold or exclusion was changed.

Real SDK success flows pass for admin/manager in each viewport. Failure flows
prove SDK-cleared session plus retained PR21 metadata on the same URL, no customer
UI, one in-flight logout despite double-click, and explicit retry success/cleanup.
Both late inquiry cancellation and late successful commit remain one POST, with
zero/one synthetic server insert respectively, no automatic resend or stale UI.
Mock-unit tests additionally prove returned error/exception handling, delayed
SIGNED_OUT, user/school separation, cleanup refusal and complete-state history.

Independent reviewer /root/logout_review: P1/P2 resolved, no remaining blocker.
Final screenshots show readable desktop/mobile retry controls with no customer
data. next-env.d.ts was restored by verification and is absent from final diff.
Origin/main re-fetched and still fdca0da5229193acf9c592522c5ec23278f37e80.
Only this result and verify-4.log represent final local acceptance. Earlier RED
and failed reports remain historical evidence. Local commit SHA/tree are recorded
in the external manifest after commit to avoid a self-referential hash.

Remaining gates: approval of branch-only automatic-deployment suppression before
push/draft PR, then final remote head/synthetic merge tree CI. Main merge, a fresh
candidate build, staging alias and real OAuth require their separate approvals.
No prior candidate is accepted for this fix. Live backend revocation/other-device
behavior and production BFCache are not claimed from isolated endpoint mocks.
