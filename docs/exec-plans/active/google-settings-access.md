# Google settings access boundary

Base: production main077f147be1a78b1ab7ac0d56d5c722f568ac7fa6.
Branch: codex/google-settings-access, separate worktree from existing probe work.

## Scope
Fix GET/POST /api/settings/google and its dashboard re-export. Missing credentials
currently use admin/fallback; the route only rejects authenticated pending users.
GET can silently substitute a manager's primary school and lacks explicit tenant
authorization. Invalid sessions currently become500; raw errors are logged.
GoogleAccount queries currently return all columns. Frontend already sends bearer.

Use existing requireActiveProfile resolver mode (no invitation/metadata promotion),
explicit401/403, canAccessSchool and requested/effective school consistency before
business queries. Keep successful save shape and token masking. Select only the
account fields required by masked settings; unused upsert result selects id only.
Do not redesign shared fallback: other consumers need separate scoped review.

No DB/schema/production/customer/provider/OAuth changes. No new API scopes or
credential inspection. Disable preview deployment for this feature branch before
push; authorized CI/draft PR only. No merge/deploy approval for this new PR.
TargetKeyword is on hold; PR8 and its approval/cleanup evidence remain in the
existing security-access-boundaries worktree/plan. Do not include probe commits.

## Acceptance and progress
- [x] Inspect route, alias, shared auth/access helpers, frontend headers and tests.
- [x] Red tests: unauthenticated/invalid/pending/cross-school, zero business effects.
- [x] Preserve assigned-manager/admin normal paths and masked secret serialization.
- [x] Allowlisted queries and safe server errors, alias coverage.
- [x] Full local codex:verify including desktop/mobile synthetic E2E.
- [ ] Exact-head CI and separate draft PR (results recorded in PR and parent report).
- [ ] Separate draft PR, exact SHA and rollback report to parent; no production action.

## Validation
Use local synthetic mocks/PGlite/Playwright only. Existing API UI fixtures are
mocked boundaries, not live provider or customer evidence. Run focused red/green,
then npm run codex:verify with existing /tmp/school-os-playwright browser cache.
Do not reduce coverage or change existing unrelated behavior to pass checks.
Rollback if later approved for release: revert only this PR via normal protected
workflow. This reopens the gap; parent decides. Never roll back PR8 automatically.

## Local results (2026-10-10)
- Red:9 failed/19 passed in the Google route tests before implementation.
- Green:focused Google route/shared auth tests passed; aggregate166 files/1991 tests,
  coverage99.26% statements/lines,97.51% branches,99.77% functions.
- Preflight,9 tooling tests,migration safety,Prisma generation,typecheck,lint (existing
  warnings),plain build and40 desktop/mobile E2E all passed. New Google settings
  bearer/save/reload/masking flow passed on both viewports; mobile screenshot reviewed.
- Initial dependency install hit restricted npm-cache writes; repeated with dedicated
  /tmp cache and ignore-scripts. Lockfile unchanged. First aggregate failed because
  deployment-policy test enumerated old feature branches; added exact new disabled
  branch to both config and expectation,then reran full aggregate successfully.
- Application diff is one route only; alias reuses it. Shared auth,Prisma schema,
  dependency manifests and OAuth configuration unchanged. Remaining common fallback
  users are outside this bounded fix; no system-wide safety claim.
- Evidence outside repository: ../evidence/security-access-boundaries/
  google-settings-red.log,google-settings-green.log,google-settings-verify.log.
- Production remains077f147; no DB/customer/provider changes. Parent must approve
  exact new PR head separately before merge/deployment. TargetKeyword stays on hold.
