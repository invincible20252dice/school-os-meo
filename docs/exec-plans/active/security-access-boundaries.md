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
Only metadata/counts read; no secrets/customer content fetched. pg_stat_activity
role counts cannot prove the deployed Prisma DATABASE_URL role. External/legacy
clients remain unknown; both are blockers to changing production GRANTs.
Performance GET may UPSERT metrics; profile resolution may accept invitations;
survey save replaces items. Do not treat ordinary browser GET as write-free.

## Acceptance
- [x] 27-table access matrix, metadata/counts, one-scope change/rollback SQL.
- [x] Unauthorized/pending/cross-school deny before effects; safe serializers.
- [x] Initial invitations work; accepted invitations cannot undo suspension.
- [x] Isolated RLS/column privilege tests with synthetic roles/rows.
- [x] Relevant frontend bearer flow, desktop/mobile E2E and full codex:verify.
- [ ] Feature push/draft PR and exact-head CI; report five items and fixture gaps.

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
changed. This active plan remains open for runtime DB-role proof, external-client
dependency confirmation, explicit fixture approval, parent five-item report,
then separately approved narrow permission action and live/regression gates.
Feature branch deployment is disabled; exact-head CI is recorded in the draft PR.
