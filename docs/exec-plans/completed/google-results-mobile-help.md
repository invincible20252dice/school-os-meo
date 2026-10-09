# Google results mobile help placement and release preparation

Base dd11731, same draft PR #5. Previous refresh and SQL acceptance remain closed.

## Scope

Reproduce the fixed help launcher's overlap with Web +1 on iPhone 13. Put the
mobile launcher in normal document flow immediately after the dashboard header,
so it remains easy to find without covering actions at any scroll position.
Keep the desktop placement and support dialog behavior. No schema, API, tracking,
provider, billing or authorization changes. The shared dashboard placement also
benefits other mobile screens; verify opening/closing/focus and navigation.

Read layout, SupportChat CSS/component/tests, Google results UI/E2E, architecture,
product/development rules and verification skill. Inspect release metadata with
read-only Vercel calls; no merge, deploy, promotion or production DB access.
Prepare PR-wide release approval facts and distinguish product policy from current
meeting-status implementation. Do not invent a scheduled/held workflow.

## Acceptance

- [x] Browser regression fails on current mobile overlay.
- [x] In-flow mobile help; unobstructed Web/LINE/phone and meeting controls.
- [x] Help open/close/focus, desktop/mobile screenshots and narrow mobile check.
- [x] Full codex:verify and exact-head CI for mobile code.
- [x] Release approval packet (superseded by expanded lifecycle scope): target, effects, compatibility, no new migration,
      rollback, remaining risks, evidence for minimal meeting-definition decision.

Next release actions require PM approval; this task prepares them only.

## Local outcome and scope extension

Regression failed before the fix because Web +1 hit-testing returned false.
Mobile help now occupies normal flow after the header (<=880px); desktop stays
fixed. All three inquiry actions and the meeting action are unobstructed, touch
registration works, help opens/focuses/closes, and 320px width is also checked.
Full codex:verify passed: 9 tooling, 161 files / 1,929 tests, typecheck, lint (six
existing warnings), build, 32 desktop/mobile Chromium E2E. Screenshot-only capture
was refined to viewport images while scrolled and full-page images at the top;
the two targeted cases passed again. No product logic/schema changes.

The PM subsequently authorized planned/held/enrolled lifecycle implementation and
real Supabase acceptance. This supersedes the earlier request to ask a minimal
product-definition question: do not ask again for feature scope. Release approval
preparation must now cover that expanded candidate, not imply this UI-only head
completes the acquisition funnel. Production release and DB writes are still gated.

Read-only production metadata confirms Vercel school-os-meo / production main
at a17040c, primary app alias app.jukumeo.com, deployment dpl_2Rq4iN1WMCKoGuMzWrr1CawJQXPY.
Supabase project bwqfuzporivryrteinjy is school-os-meo, ap-northeast-1, healthy,
Postgres 17.6. GoogleLead schema matches existing migration, RLS enabled, no public
policies; one existing legacy meeting record exists. No customer record changed.
The Vercel sensitive-variable decrypt attempt was rejected by automatic review;
no decryption occurred. Chrome project metadata plus the Supabase connector
provided read-only inspection without credentials or new authentication setup.

Mobile code 921f8ff7d3b73e50c7b5a2188a8854ca7de19cf0 passed both Linux CI runs:
https://github.com/invincible20252dice/school-os-meo/actions/runs/37918835400
https://github.com/invincible20252dice/school-os-meo/actions/runs/37918827764
Expanded work continues in active/google-lead-lifecycle.md; release packet is
docs/google-lead-release-approval.md. No release authorization was inferred.
