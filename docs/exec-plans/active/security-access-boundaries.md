# Staged security access boundaries

Base: current main 2bc8685fb6bbcc7647884432c704938099cd950c.
Branch: codex/security-access-boundaries. PR #7 remains unchanged/unapproved.

## Scope and gates
Inspect existing auth helpers, API routes/callers, tests and production metadata.
Fix only Instagram settings and GBP selection authentication/secret serialization,
ChurnAlert school-scoped access, and accepted invitations reactivating profiles.
Keep first invitation onboarding; no auth redesign, new UI, paid/provider actions.
Create separate one-table TargetDistrict and profiles column-GRANT candidates and
isolated SQL tests. Never execute candidate SQL against production. No blanket
27-table changes, new accounts/tokens, customer writes or archived fixture reuse.
Parent must report the five specified items before any production grant action;
each small scope then requires real-screen and regression gates before the next.
No deployment or main merge is authorized.

## Evidence and uncertainties
Read-only metadata reconfirms 27 tables RLS OFF/full anon/authenticated grants,
and profiles self-row policies with broad UPDATE including authorization fields.
Only metadata/counts and narrowly scoped error metadata read; no secrets fetched.
Correlated PostgreSQL error metadata now proves postgres for the observed district
request. External/legacy clients and production CRUD readiness remain blockers.
Performance GET may UPSERT metrics; profile resolution may accept invitations;
survey save replaces items. Do not treat ordinary browser GET as write-free.

## Acceptance
- [x] 27-table access matrix, metadata/counts, one-scope change/rollback SQL.
- [x] Unauthorized/pending/cross-school deny before effects; safe serializers.
- [x] Initial invitations work; accepted invitations cannot undo suspension.
- [x] Isolated RLS/column privilege tests with synthetic roles/rows.
- [x] Relevant frontend bearer flow, desktop/mobile E2E and full codex:verify.
- [x] Initial feature push/draft PR #8 and exact-head CI at 1aa2501.
- [ ] Auth-expiry follow-up, full verification, new exact-head CI and pilot blockers.

## Local validation and remaining production gate
Full codex:verify passed: typecheck, lint, 166 files / 1,962 tests,
coverage 99.25% statements/lines, 97.49% branches, 99.77% functions, build and
38 Chromium desktop/mobile E2E. Alert bearer/update/reload screenshots reviewed.
Initial local tests expected the old secret-return behavior; assertions now require
masking while persistence still receives a replacement secret. A new GBP UI test
initially assumed locationName; corrected to the existing selectedGbpLocationId
contract, then focused and aggregate tests passed. No gate weakened or skipped.

Current production was rechecked read-only via existing official Vercel CLI:
READY dpl_J7gHkQ8DAvoJiAYkdwY5tcLNnKt1 / main 2bc8685.
No production grants, RLS, policies, migrations, customer records or auth accounts
changed. This active plan remains open for schema compatibility, external-client
dependency confirmation, explicit fixture approval, parent five-item report,
then separately approved narrow permission action and live/regression gates.
Feature branch deployment is disabled; exact-head CI is recorded in the draft PR.

## Read-only follow-up / limited recovery (2026-10-10)
- Existing Google Chrome admin session district GET returned 500. Scoped Vercel
  runtime log identifies missing updatedAt; catalog confirms production
  TargetDistrict lacks updatedAt while Prisma expects it. The old CREATE TABLE IF
  NOT EXISTS migration cannot reconcile a pre-existing legacy table. No DDL run.
- GET now selects only its four UI fields, so it does not depend on updatedAt.
  POST/PATCH still require schema reconciliation: do not claim CRUD/pilot ready.
- Auth getUser rejected/missing users become a typed safe 401 in settings, GBP,
  alerts and districts. Auth outages remain 500; pending stays 403. Provider error
  strings never escape the resolver. Tests exercise all guarded route methods.
- Full verification first reached E2E but sandbox denied loopback listen (EPERM).
  The next run found Chromium absent from the default cache. Repeat using existing
  /tmp/school-os-playwright with loopback access; no test/coverage changes.
- Initial statement-statistics correlation was inconclusive. Subsequent server
  error metadata resolves the observed role below; no credentials were fetched.
- Both proposed identities are existing active business users: manager assigned
  to a real school and global admin. Preserve them. Dedicated manager identity
  remains required, with no invitation, login or role change authorized.
- Cleanup proposal: retain both new district rows, restore the two synthetic
  schools to ARCHIVED, suspend/remove the dedicated test user's fixture links.
  No DELETE, no Auth deletion. Archived schools disappear from normal selector,
  but direct district API currently permits an authorized explicit archived ID;
  archive alone is NOT complete API isolation. No global TargetDistrict aggregate
  consumer was found. Full production regression and external consumers unknown.

### Resolved evidence after the initial follow-up
The controlled browser request started at 03:55:14 UTC. PostgreSQL error metadata
at 03:55:17.940 UTC identifies TargetDistrict PARSE / SQLSTATE 42703 under
postgres, application Supavisor. Together with Vercel's updatedAt error and the
catalog this establishes the DB role for that observed production request without
reading credentials. Successful post-change execution is still a separate gate.
The subsequently designated test identity already exists as pending manager with
no school assignment: new Auth user creation is unnecessary. Reactivation and
school-A assignment still await the concrete fixture approval. Restore this
existing pending/unassigned baseline after the pilot; do not delete the account.

Follow-up local aggregate verification passed: 166 files / 1,978 unit tests,
99.25% statements/lines, 97.51% branches, 99.77% functions; typecheck, lint,
plain build and 38 desktop/mobile E2E passed. No test gates weakened.
Additional read-only legacy checks: 3 districts, unique (schoolId,name) index
exists, no duplicates/orphans/null aiMessage/null createdAt. Catalog allows those
last two columns NULL and has no school FK; preserve all legacy columns/data and
review reconciliation separately. No production schema repair is authorized.
