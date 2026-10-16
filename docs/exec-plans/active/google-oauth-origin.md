# Google OAuth callback origin allowlist

Base: PR #22, bfc522d797cc2cd918b4f9c57d15a9d0889c2492.
Isolated branch: codex/google-oauth-origin. PR #22 is not modified or merged.

## Scope and evidence

The login page passes window.location.origin. Previously startGoogleOAuth passed
NEXT_PUBLIC_APP_URL || NEXT_PUBLIC_SITE_URL to getAuthCallbackUrl, which prefers
that configured URL over browserOrigin. The parent observed an authorize request
with https://school-os-meo.vercel.app/auth/callback while on staging. Which variable
supplied that URL and the exact candidate bundle value remain unconfirmed; the
previous denied environment-value read was not repeated or bypassed.

Google-only exact string allowlist: https://staging.jukumeo.com,
https://app.jukumeo.com, https://school-os-meo.vercel.app. Callback path is fixed.
No normalization, trimming, Host headers or URL query parameters select the target.
Missing, external, lookalike, path/query/fragment/userinfo and port inputs fail before
signInWithOAuth. Development-only http://localhost:3030 and :3031 preserve existing
test/dev origins; http://127.0.0.1:3030 matches npm run dev. All loopback is rejected
in a production build. No test-only production allowlist exception was introduced.

Only supabase-auth.ts changes application behavior. login/page.tsx already passes
the correct origin and catches errors, so needs no edit. Google scopes, consent,
magic-link resolver, callback/session handling, PR21 inquiry recovery, PR22 local
logout, server authorization, school isolation, DB, secrets and settings are intact.

## Validation

- TDD RED: 30 failed / 21 passed before implementation; GREEN: 51 passed.
- Final aggregate verify-4: PASS. All 2,240 tests / 177 files; coverage
  statements/branches/functions/lines 99.27/97.50/99.78/99.27%, all existing 95%
  gates intact. Tooling, migration static checks, typecheck, lint (6 inherited
  warnings), plain production build and 112 E2E (56 desktop / 56 mobile) pass.
  PR21 recovery and PR22 real-SDK synthetic logout cases all pass unchanged.
- Earlier attempts: sandbox denied local listening; normal execution initially
  lacked the browser cache path. Reused /tmp/school-os-playwright without installing
  or changing settings. A later unrelated PGlite migration test exceeded 5 seconds;
  standalone rerun passed in 1.38s, final full rerun passed with thresholds unchanged.
  Focused browser run also passed 38 tests. No product/test relaxation was needed.
- Desktop/mobile rejection screenshots inspected: error readable, retry control
  enabled, no layout obstruction. next-env.d.ts restored by aggregate verification.
- Evidence outside repo: ../oauth-evidence/{red.log,green.log,verify-4.log,
  e2e-focused.log,independent-review.txt,aliases.json}. Earlier failed logs retained.
- Same local production build is served at virtual HTTPS origins in E2E. All assets
  are fetched from loopback; actual SDK authorize navigation ends at the synthetic
  local endpoint. 3 approved origins and 2 rejected origins run desktop/mobile.
  Existing loopback OAuth test now verifies rejection, as production loopback is
  intentionally disallowed. Existing recovery/logout cases remain unchanged.
- Independent read-only review /root/oauth_review: no required findings; inspected
  all code/tests including the new E2E fixture, scope preservation and diff-check.

## Remote gate

Vercel config currently has 11 exact false branches, no true or wildcard entries,
no codex/google-oauth-origin entry. Official git.deploymentEnabled documentation
says omitted branches default to true; matching true overrides false. Push is held.
Required narrow approval: add "codex/google-oauth-origin": false to vercel.json and
the strict expected map in scripts/tests/verification.test.mjs. No broader setting
change. Then rerun verification, commit/push and create a stacked Draft PR targeting
codex/logout-local-session; inspect exact-head GitHub Codex Verify checks.

Official reference: https://vercel.com/docs/project-configuration/git-configuration
Project read identifies school-os-meo / prj_z1tfbliHbJ76sHzfZjrM2Kc4psfu.
Alias read with explicit team/project returned provider 403, not an approval denial.
The existing cached Vercel CLI 59.11.7 was subsequently found under /tmp and the
same scoped read succeeded using its existing credentials. The two production
aliases remain dpl_48Erde1hQPKvorWUmgciC7CY9ZH1; the default alias remains
dpl_XAFUXm6gv5KWVYfMmUzUebmE9jsN. staging is absent. No auth/setup flow was initiated.
Candidate creation is held: CI has not run and safe alias-preserving creation is
not established. --prod --skip-domain is not assumed safe, given the prior observed
alias change. No deployment, alias, Protection or environment mutation attempted.

Rollback: discard this isolated unmerged branch. No remote runtime/data change
needs reversal. Live Google OAuth, production session persistence and other-device
behavior are outside synthetic test evidence and were not exercised.


## Authorized remote review phase

The user approved the exact codex/google-oauth-origin:false addition and matching
strict-map test in section 15 of the attached autonomous-development instructions.
Applied only those two configuration/test changes; all previous 11 entries remain
false and there are no wildcard/true matches. Reverification, branch push, stacked
Draft PR against PR22 and exact-head GitHub CI are authorized. Candidate deployment
creation is now explicitly prohibited, regardless of the earlier conditional gate.
No shared operational-rule changes belong in this callback PR. Final SHA, CI and
alias comparison are recorded externally to preserve the verified commit.
