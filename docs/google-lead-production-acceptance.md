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

Actual production browser evidence is desktop. Chrome's viewport override did
not change its observed 1386px viewport, so no live mobile claim is made; mobile
and 320px interaction acceptance remains the isolated Chromium E2E evidence.
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
