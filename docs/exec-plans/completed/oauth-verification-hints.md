# OAuth verification hints and autonomous PM policy

## Objective and boundaries

Save the requested autonomous PM policy and reduce repeated Google account selection
only for an explicit verification login. Normal login remains unchanged. No DB,
migration, secret, environment, scope, callback or authorization changes. This feature
branch is not authorized for main merge or production deployment.

## Inspected behavior and design

Read AGENTS, product/development rules, architecture, testing and the verification
skill. Current `src/app/login/page.tsx` calls `startGoogleOAuth`, which allows four
exact origins, sets the same-origin `/auth/callback`, business.manage scope,
access_type=offline and prompt=consent. Callback establishes the Supabase session;
existing approval and school access checks remain authoritative.

An individual login URL explicitly opts in using
`/login?auth_verification=1&account_type=admin` or `account_type=general`.
No query parameters means OFF; mode is not persisted. Enabled mode requires exactly
one supported account type. Invalid or duplicate selectors are rejected before OAuth.
Only the fixed internal mapping can supply a login_hint. No email input, query value,
or OAuth URL rewriting is used. Other query values are never forwarded.

Supabase JS/auth-js 2.110.8 supports `signInWithOAuth.options.queryParams`:
[Supabase Google login](https://supabase.com/docs/guides/auth/social-login/auth-google).
Google documents [login_hint](https://developers.google.com/identity/openid-connect/openid-connect)
as a selection hint, not an authentication or authorization guarantee. SDK source
`SignInWithOAuthCredentials` and GoTrueClient serialization were checked against the
installed lockfile. Keep redirectTo, scopes and existing queryParams unchanged,
adding only login_hint when enabled. Human authentication remains necessary when asked.

## Files, consumers and risk controls

- Policy agent owns AGENTS.md and docs/AUTONOMOUS_PM_POLICY.md.
- Auth helper, login caller, unit/SDK tests and synthetic callback E2E verify the behavior.
- Existing E2E fixtures isolate app/Google/Supabase boundaries; no production data or
  paid API requests. Real OAuth acceptance of the already-deployed PR18 is separate.
- Disable only this branch's Vercel Git deployment before push, with tooling assertion.
- No email shown in application UI. No credentials, tokens or codes stored in evidence.
- login_hint does not grant a role or prevent Google from requesting consent/identity.

## Checklist and acceptance

- [x] Identify isolated feature worktree; correct origin and preflight pass.
- [x] Confirm official SDK mechanism and inspect affected code/tests.
- [x] Save policy and mandatory AGENTS reference without weakening approvals.
- [x] Implement default-OFF finite selectors and fixed SDK queryParams.
- [x] Unit tests: normal/admin/general, invalid/injection, unchanged scope/redirect.
- [x] Desktop/mobile E2E: callback, session reload, logout, re-login, normal regression.
- [x] Run codex:verify (typecheck, lint, coverage, build, E2E and safety/tooling checks).
- [x] Commit, push feature branch, draft PR; inspect Actions for exact SHA.
- [x] Independent review and safe corrections; record final evidence.

## Current status and next safe work

Implementation, local/Linux verification, draft PR and independent review complete.
[Draft PR #19](https://github.com/invincible20252dice/school-os-meo/pull/19) stays
unmerged and undeployed. Next safe work is a separate concrete merge/deploy decision,
then live OAuth acceptance for both designated accounts. No environment variable,
secret, DB or migration change is needed for this per-login opt-in design.
The already-approved PR18 live acceptance is separate and does not release this feature.

## Validation log

- Preflight: passed on origin/main b9867de5a10507da1bcd5014173198bb0e028f3e.
- Targeted auth tests: 86 passed (37 existing, 49 new); installed SDK serialization
  checked without network. Typecheck, lint, 2,117 unit/integration tests and coverage
  gates passed. Build passed in the isolated loopback environment.
- New E2E: 24 passed (12 desktop, 12 mobile viewport), including all three login
  modes, callback, reload, logout, protected entry and ordinary re-login.
- Initial E2E failure: a simulated provider HTTP 302 caused Playwright to follow
  its target without routing it through the local fixture. The existing canonical
  HTML was fetched and local asset lookup failed. No real OAuth or customer API/DB
  write occurred; the callback fragment contained only synthetic test data.
  Replaced this with a synthetic provider document and a new document navigation,
  required a locally proxied callback 200, and blocked non-loopback DNS for this
  spec. A duplicate settings locator was scoped to the account navigation.
  All 24 cases then passed; no application auth behavior was changed to fix tests.
- Independent source/policy/test review: no outstanding actionable findings;
  reviewer independently confirmed the fixture failure and its fix. Final source
  commit and tree were checked against the reviewed diff; generated next-env.d.ts
  changes were excluded and the worktree was clean.
- Full local `codex:verify`: passed. Tooling 9/9, migration safety, Prisma generation,
  typecheck, lint, 171 unit/integration files (2,117 tests), 95% coverage gates,
  production build, 80 E2E (40 desktop + 40 mobile viewport) all passed.
  Coverage: lines/statements 99.25%, branches 97.53%, functions 99.77%.
  Initial aggregate run had one existing PGlite migration test exceed its 5s limit;
  unchanged targeted rerun passed in 1.96s, then the whole aggregate passed.
  No timeout increase, skip, exclusion or test weakening was applied.
- Source commit: `b6e95ce72177c875954c63b4bc50ca68ad4cbd94`.
  Tree: `c41eab6a2656df332e510120b21d4f6624363395`.
- [Push CI 38353512519](https://github.com/invincible20252dice/school-os-meo/actions/runs/38353512519):
  passed, job 115151035030, checkout exactly the source commit above.
- [PR CI 38353663461](https://github.com/invincible20252dice/school-os-meo/actions/runs/38353663461):
  passed, job 115151513859, checkout `39a27883d03cc7e8d2380f0f44b0c732c1984d77`.
  This GitHub test merge has the identical source tree above. Both Linux runs passed
  all 2,117 unit/integration tests, coverage, build and 80 desktop/mobile E2E cases.
  Checkout SHA and test totals were checked from the actual job logs.
- This final plan update only records completed checks. Any later head/check results
  are recorded in PR #19; it does not change application or verification code.
- Vercel: this feature branch has no deployments; only its Git auto-deploy disable
  entry changed. Supabase: no project/DB/auth configuration operations for this feature.
  Live Google consent/token issuance, real Supabase transport and physical mobile
  devices remain not run for this feature; synthetic checks do not certify them.
