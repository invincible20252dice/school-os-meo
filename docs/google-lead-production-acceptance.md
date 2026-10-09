# Google lead production execution — 2026-10-09

Production lifecycle release and existing-session acceptance succeeded. Fresh
login at app.jukumeo.com remains unverified because Google displayed its
unverified-app warning; the agent did not continue that warning or grant access.
Do not imply that fresh canonical-domain authentication was tested.

## Release identity and permissions

- PR #5 approved HEAD: 256e92f7b5f64ffe3091d94894627c2995304710.
- Actual main merge: 2bc8685fb6bbcc7647884432c704938099cd950c.
- Vercel project school-os-meo / prj_z1tfbliHbJ76sHzfZjrM2Kc4psfu,
  team team_SIPmeIIiQ35CcQi0fiLNBK0b.
- READY production deployment: dpl_J7gHkQ8DAvoJiAYkdwY5tcLNnKt1,
  https://school-os-pmpcgrm2t-invincible20252dice-2177s-projects.vercel.app .
- app.jukumeo.com and school-os-meo.vercel.app aliases both assigned to that build.
- Main ruleset 24785246: active, refs/heads/main only, PR + Codex Verify from
  GitHub Actions required, latest-base checks, no force push/deletion, no bypass.
  Effective feature-branch rules were empty. Existing same-account Git auth was
  verified as invincible20252dice with admin access; no credentials were created.
- Vercel connector GET /v13/deployments/{id} returned 403 for the same team. The
  explicitly approved official CLI fallback used existing CLI credentials and
  explicit teamId. GET /v9/projects/{id} and deployment reads succeeded for this
  exact project/team. No secret environment variable was decrypted or exported.

## Database and data preservation

Supabase project school-os-meo / bwqfuzporivryrteinjy, ap-northeast-1, PostgreSQL 17.6.
Applied the exact reviewed contents of
supabase/migrations/20261009104049_google_lead_lifecycle.sql, SHA-256
dafee7e08eaf4d28e93e986eb69fab91ae91c3e4c9e072cf155afcda89544d1b.
The connector recorded migration version 20261009112904 / google_lead_lifecycle.
Do not blindly replay the source file or run an unreviewed schema push based on
the differing tool-generated history timestamp.

Three nullable timestamp columns, four chronology checks and three indexes were
verified. Existing status constraints, grants and RLS were not changed; RLS stays
enabled with zero public policies. The original meeting row has null new dates.

Counts/digests of the original fields matched across all 15 inspected tables both
immediately after migration and after cleanup (excluding only exact fixture IDs).
GoogleLead 1, School 5, User 1, UserSchool 0, Review 4, Survey 4, SurveyItem 26,
TargetKeyword 4, TargetDistrict 3, RankHistory 0, AioMeasurement 5, GbpMetric 0,
SchoolChallenge 1, ChurnAlert 2, GoogleSearchKeywordMonth 1. Password hash values
were excluded from the User digest; credentials/production payloads were not
exported. No customer writes, backfill, DELETE, DROP, TRUNCATE or type changes.

## Real acceptance and cleanup

Chrome's existing administrator session on school-os-meo.vercel.app exercised the
actual Vercel -> Prisma -> Supabase path. A separate Supabase connector SQL session
verified committed rows; no browser token was extracted and no API response mocked.

- A: double-click Web +1 created exactly one inquiry. Scheduled save/reload left
  version 2. Two tabs submitted held at the same version: one success, one explicit
  conflict; SQL confirmed one held timestamp and version 3. Refresh recovered the
  losing tab. Enrollment and reload confirmed all milestones and version 4.
- B: initially zero despite A's complete lifecycle; LINE +1 created one separate
  inquiry, no milestones, version 1. Reload and independent SQL matched. Two total
  test leads, below the authorized maximum of ten.
- The existing system-user (HEADQUARTERS, system@school-os.local, no password,
  Auth user, Account or Session) supplied the existing owner FK. No User was
  inserted, updated or removed; no memberships, profiles or login grants changed.
- Schools used exact IDs codex-google-lifecycle-20261009-a / -b and names
  CODEX検証専用・顧客用ではありません A / B. They were ACTIVE only during acceptance.
  No Google/Instagram connection, keyword or external provider write was created.
- Initial empty-place setup failed the existing School.googlePlaceId unique index
  and rolled back fully (zero fixture schools). Revised setup uses unique
  CODEX_TEST_NOT_A_GOOGLE_PLACE_A / _B markers. Actual NOT NULL/UNIQUE behavior and
  guarded cleanup were verified in isolated SQL before retrying production.
- Cleanup logically deleted only the two fixture leads and archived only the two
  fixture schools, preserving rows/FKs. SQL: zero visible fixture leads, zero
  ACTIVE fixture schools, two ARCHIVED fixture schools, zero synthetic owners.
  Normal selector showed only the original active customer school. Archived
  fixture outcome counts were zero. No physical deletion was needed.
- Existing outcomes show the original inquiry and explicit legacy-unclassified
  warning, without inferring held/enrolled. Overview and reviews loaded without
  alerts; original data comparison remained unchanged.

## Validation and remaining boundaries

Release main CI succeeded with 164 files / 1,949 tests and 32 desktop/mobile E2E:
https://github.com/invincible20252dice/school-os-meo/actions/runs/37924124160 .
Pre-merge candidate CI also succeeded on both push and pull_request. Typecheck,
lint (six existing warnings), migration checks and plain build passed.

Initial production browser evidence was desktop: the first viewport override
did not change the observed 1386px viewport. A subsequent read-only check below
verified actual 390px/320px desktop Chrome viewport emulation; real mobile-device
and live mobile write acceptance remain untested.
Fresh canonical-domain OAuth remains pending user handling of Google's warning.
The Google-performance retrieval error was already visible before release and
remained separate from successful manual inquiry persistence.

Rollback was not needed or executed. Approved recovery remains prior deployment
dpl_2Rq4iN1WMCKoGuMzWrr1CawJQXPY / a17040cc0a37e281795da5f3a1c89b1222d8691f,
school-os-vxhuv96o1-invincible20252dice-2177s-projects.vercel.app, in the same team.
Keep additive columns/data, never reset/force-push main, and use a fix/revert PR.
Actual rollback write permission has not been exercised merely to test it.

Execution evidence is retained in the task's evidence/google-lead-lifecycle folder:
main-ruleset.json, pre-migration.json, post-migration.json, merge.json,
production-deployment.json, live-acceptance.json, cleanup-verification.json,
final-existing-data.json and browser screenshots. The SQL/documentation follow-up
does not authorize a further deployment.

## Read-only follow-up and PR #6 self-review — 2026-10-09 12:04 UTC

PR #6 remains a draft, unmerged and undeployed. Self-review of its diff against
main found no blocking issue: fixture IDs/owner guards stay bounded; setup cannot
reuse existing fixture IDs; the actual NOT NULL/UNIQUE constraint is modeled;
cleanup preserves customer rows and users; branch preview deployment is disabled.
This review does not authorize another production fixture run.

Chrome's existing administrator session loaded the already archived fixture A on
school-os-meo.vercel.app. No fixture was recreated and no record button was
clicked. Measured innerWidth/clientWidth/scrollWidth were 390/390/390 and
320/320/320. All three inquiry buttons were 48px high and their center hit tests
reached the correct button (115px wide at 390px, 92px at 320px). The 320px help
dialog stayed within the viewport (x=26, width=282, right=308), opened and closed
without submitting a question. Width was reset to 1386px afterward. This proves
responsive read-only layout in desktop Chrome, not touch/device behavior or
mobile persistence. All 15 existing-data digests still matched afterward.

The official Vercel CLI read reconfirmed app.jukumeo.com and
school-os-meo.vercel.app on READY dpl_J7gHkQ8DAvoJiAYkdwY5tcLNnKt1 at exact main
SHA 2bc8685fb6bbcc7647884432c704938099cd950c. GitHub ruleset 24785246 was re-read:
enforcement=active, exact refs/heads/main, no bypass actors, current-user bypass
never, PR and strict Codex Verify (GitHub Actions integration 15368), deletion
and non-fast-forward blocked. No repository or deployment setting was changed.

The pre-existing Google-performance error's root cause is still unresolved.
Read-only schema inspection found all required metric/connection columns. Both
stored location references match the accepted numeric/locations-numeric shape;
no token values or provider secrets were read. Vercel's connector log read was
403; the already approved same-team official CLI fallback succeeded, but exposed
three HTTP-200 performance request records with no nested runtime log lines.
HTTP 200 does not prove metric success: this endpoint returns state=error inside
its successful JSON envelope. Existing code discards the detailed error and
logs only generic Fetch/store failed or Settings/storage unavailable messages.
The available evidence cannot distinguish refresh/configuration/provider/parser
or persistence failures; do not prescribe reauthorization based on this alone.

GET /api/dashboard/google-results/performance can refresh Google credentials and
upsert GbpMetric. Consequently no customer-school refresh/reproduction request
was made during this read-only investigation. The archived fixture has no Google
connection and returns disconnected before that path. No OAuth warning was
continued, scopes changed, secrets retrieved/modified, or paid API added.

Impact: manual GoogleLead reads/writes and milestone counts are a separate route
and remain independently verified. Current NEXT ACTION input in challenge-data.ts
does not consume loadPerformance/GbpMetric; it uses connection settings, reviews,
posts, competitors and its separate search-keyword loader. Thus this performance
error does not directly change that action ranking, but website/phone click
feedback remains unavailable or stale, limiting evaluation of action results.
An additional read of the already stored search-keyword diagnostic (checked at
2026-10-09 06:07:49.459 UTC) found API_ERROR, stage OAUTH, HTTP 400 and OAUTH_ERROR.
A boolean-only classification of its existing error message matched
expired/revoked/invalid_grant and did not match invalid_client/unauthorized_client;
the raw message, token and scopes were not returned. This is evidence of a prior
refresh failure in the separate search-keyword path, not proof of the current
performance endpoint's exact cause. It does reduce search-demand evidence for
NEXT ACTION; the connection-settings flag alone is not proof that OAuth works.
Parent decision: have the authorized user assess the Google warning/connection
and any reauthorization through normal account controls; do not retry, widen
scopes, or change credentials on the basis of this agent's investigation alone.
Next safe task: add bounded, non-secret error-stage/status diagnostics with local
tests, then seek release approval before collecting new production diagnostics;
do not log raw exceptions, headers, token bodies or provider response payloads.

Evidence: main-ruleset-recheck.json, main-effective-rules-recheck.json,
production-readonly-390.jpg, production-readonly-390-controls.jpg,
production-readonly-320-controls.jpg and production-readonly-320-help.jpg.
