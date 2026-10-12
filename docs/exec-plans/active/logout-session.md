# Local-session logout and dashboard re-entry

Base 4ac1cb6 (stable 25f39b1 + auth preview-disable metadata), separate from PR15.
Worktree school-os-logout / codex/logout-session. No main or Instagram changes.

Root cause: DashboardHeader logout only links to /login. AuthApprovalGate returns
on missing session and renders no boundary, so direct URLs still mount cached UI.
Browser client is supabase-js default persistent origin localStorage. Server client
is service-role with persistSession:false, not SSR cookie client. No middleware or
Supabase SSR package/auth-cookie adapter. APIs use bearer tokens and existing access
checks. Cookie deletion/server-only logout would not clear this browser session.

Plan: browser signOut explicitly scope local; verify local session absent before
hard login navigation. Hide dashboard while checking/out, show safe retry on
failure, and revalidate on route entry/pageshow/focus and SIGNED_OUT. Wrap protected
layout so no child mounts before authenticated+approved server /api/auth/me result.
Hide before pagehide for BFCache; ignore stale checks. API checks remain unchanged.
Do not migrate auth to SSR or revoke other sessions; existing JWT expiry remains
Supabase behavior, not immediate universal access-token revocation.

- [x] Red regression tests, then minimal fix
- [x] Full codex:verify, desktop/mobile E2E and screenshots
- [ ] Preview-disabled feature push, separate draft PR and exact CI
- [x] Stable + PR15 + logout exact integration, diff proof and verification
- [ ] Report implementation/CI before approved unassigned build

No DB, migrations, env/secrets/scopes or live session writes in development tests.
Do not assign any production alias. Current stable deployment remains
48Erde1hQPKvorWUmgciC7CY9ZH1, SHA25f39b1. Existing auth staged deployment stays staged.
Canonical real acceptance and actual cookie/storage state cannot be claimed from
isolated tests or unassigned URL; PR15 intentionally rejects arbitrary preview origin.

Validation 2026-10-12: codex:verify passed (170 files, 2,048 unit/integration
cases; 48 desktop/mobile E2E; typecheck, lint, coverage, tooling, migration
safety, Prisma generation and plain build). Coverage gates remain unchanged.
Original gate regression: 6 failures before fix. Added focus/draft regression
failed before preserving mounted content during revalidation, then passed.
Targeted logout/gate suite: 16 passed. First full attempt: 46 E2E passed,
2 failed because Next route announcer also has alert role; narrowed locator to
the actual logout error. Repeated aggregate passed. Sandbox Prisma cache utime
restriction required the authorized local verification execution environment.

E2E uses the installed real browser Supabase SDK with synthetic local sessions
and intercepted Auth/API boundaries: reload before logout, scope=local, storage
removal, unrelated storage preservation, hard login navigation, direct dashboard
and settings entry, browser back, SDK failure and explicit retry. Session fixture
seeds once so reload cannot silently log a signed-out browser back in. No real
Google OAuth, real Supabase revocation or production cookie state is proven.
Synchronous pagehide/pageshow and stale requests are covered by component tests;
Playwright routing does not establish actual production BFCache eligibility.

New feature and integration branches alone are added to deploymentEnabled:false;
existing flags, production branch, settings, env and scopes stay unchanged.
Next: push separate logout branch, draft PR against auth-stable-base, check exact
CI head; combine only PR15 with this fix and report exact candidate for review
before an unassigned production build. Public alias assignment remains prohibited.

Integration checkpoint 2026-10-12: separate draft PR16 head
`a86d3919a8002b54cb7b73f2c1eadd7980c24e31`, base auth-stable-base.
Push run 38230704230 and PR run 38230770485 are running at this checkpoint;
PR synthetic merge SHA is e9f8d919a16bcdb7bbea585e9553022f621c6525.

Combined code commit f71335d228b89f524609c209a5750d4bf4f08d98 is stable
25f39b1 + preview-disable metadata 4ac1cb6 + logout a86d391 + an exact
cherry-pick of PR15 7e50d90. All four PR15 blobs match; changed file union
matches these commits only. No main/PR12/Instagram change is included.
Combined codex:verify passed: 170 files / 2,068 tests, 56 E2E across desktop
and mobile, typecheck/lint/coverage/plain build/tooling/migration safety.
This documentation checkpoint is the only change after that tested code.
The candidate branch is codex/auth-logout-candidate with automatic deployment
disabled. Exact final CI and commit mapping are recorded in the handoff evidence.

Vercel read-only UI recheck: deployment dpl_48Erde1hQPKvorWUmgciC7CY9ZH1
remains Production Current with canonical domain and source 25f39b1.
No new deployment or alias assignment has occurred for the logout candidate.
Next gate is independent review of the fixed candidate and a demonstrably
unassigned production build; stop if the UI could assign aliases. Canonical real
OAuth/reload/logout acceptance remains not run for this unpublished candidate.
