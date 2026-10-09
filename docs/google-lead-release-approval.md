# Google lifecycle: release and real Supabase acceptance approval packet

Status: NOT AUTHORIZED / NOT DEPLOYED. Implementation and local verification are
complete in draft PR #5, branch codex/google-lead-measurement. The final
handoff and PR description pin the exact reviewed HEAD and CI runs. Do not treat
an earlier UI-only commit as approval for the expanded schema/lifecycle release.

## Authorized product scope and user benefit

The latest user explicitly requested inquiry -> planned meeting -> held meeting ->
enrollment and real Supabase persistence. No further product-scope question is
needed. Existing PRODUCT_PRINCIPLES.md line 11 establishes inquiry -> meeting ->
enrollment; original f9e1e31 and prior architecture only defined inquiry/meeting/
lost and a status-update timestamp. No existing requirement defined calendar
appointments, attendance import, payments or withdrawal management. This change
adds explicit manual stages without those extra workflows.

- All mobile inquiry buttons remain touch-accessible; help occupies its own row.
- Saved-write/read-failure no longer leaves stale KPIs actionable.
- Planned, held and enrolled confirmations are separated. The confirmation date
  is when an operator records the stage, not a booked appointment calendar date.
- Existing ambiguous meetings remain visible as old/unconfirmed, never inferred
  held or enrolled. A staff member explicitly confirms their next stage.
- Period event counts and inquiry-cohort rates are distinct; rates use confirmed
  milestones up to the selected period end. Lost does not erase an actual held
  confirmation. Explicit correction back to inquiry warns before clearing dates.
- Authorization reuses the existing requireActiveProfile option: stored active
  profiles and school scope only; no invitation acceptance or editable metadata
  role is used by Google lead requests. No profile or permission changes.

## Exact infrastructure target (read-only evidence, 2026-10-09)

Vercel team: team_SIPmeIIiQ35CcQi0fiLNBK0b.
Project: school-os-meo / prj_z1tfbliHbJ76sHzfZjrM2Kc4psfu.
Production branch: main; base SHA a17040cc0a37e281795da5f3a1c89b1222d8691f.
User-facing app: https://app.jukumeo.com (school-os-meo.vercel.app is also assigned).
Other existing aliases: jukumeo.com, www.jukumeo.com and Vercel branch/team aliases.
Current production deployment: dpl_2Rq4iN1WMCKoGuMzWrr1CawJQXPY,
https://school-os-vxhuv96o1-invincible20252dice-2177s-projects.vercel.app .
Git integration can deploy main automatically; approving a merge must explicitly
include public release, not be presented as a harmless verification-only step.
Feature branch deployment remains disabled by vercel.json.

GitHub read-only inspection returned an empty repository ruleset list and
`404 Branch not protected` for main protection. This does not meet
DEVELOPMENT_RULES.md's release gate. Before merging, approve/configure an active
main ruleset requiring PRs and the `Codex Verify` check, blocking force pushes and
deletions, with no bypass actors. Verify both push and PR checks use this exact
candidate; do not treat CI success as proof of protection. No settings were changed.

Supabase: bwqfuzporivryrteinjy / school-os-meo / ap-northeast-1 / Postgres 17.6.
Read-only metadata confirms GoogleLead, its unique school/idempotency index,
version check, existing status/date checks and RLS with no policies. One existing
legacy meeting record was observed by aggregate count only. Read-only role tests
returned zero visible leads for anon and authenticated. This is not application
persistence acceptance. No production DDL/DML has been run.

## Migration and compatibility

Apply ONLY supabase/migrations/20261009104049_google_lead_lifecycle.sql, after
explicit approval. Three nullable timestamp columns, four chronology checks and
three school/date indexes; no update/backfill, dropped column, grant, RLS policy,
enum or existing constraint change. Existing rows retain null milestones. Existing
status/meetingAt fields and old API response fields remain for compatibility.
Old application SQL can still write rows; new UI must not be deployed before this
migration. The statement uses a short lock timeout; on contention stop and report,
not loop. Existing builds run Prisma generation and Next build, not migration.

Reviewed SHA-256 hashes (the final PR head pins the complete files):

- Migration: `dafee7e08eaf4d28e93e986eb69fab91ae91c3e4c9e072cf155afcda89544d1b`
- Acceptance setup: `d7f49200d245a4e87b7cc8e4a781017fc7ea2912001d7586b8afac243ea55ea5`
- Acceptance cleanup: `a2c722576b9bc1ec97e0ef8693fef3edfaf2f7221563fd42e7bf89f46f39c8ac`

Rollback does not remove the added columns or milestones. Old UI cannot display
or manage the new milestone distinctions. During rollback, avoid further lifecycle
editing until the corrected release is reviewed. Never manufacture a reverse
backfill or restore customer rows from guesses.

## Proposed single approval bundle (not yet executed)

1. Approve the exact final PR HEAD, migration file/hash and target above after CI.
   Recheck main/base and target production deployment first; stop on drift.
   Resolve the main protection gap above before authorizing the release merge.
2. Record a metadata-only preflight, row count and digest of existing non-fixture
   legacy fields; apply the additive migration transaction to this Supabase project.
   Confirm original records/versions and null milestone values remain unchanged.
3. Run scripts/sql/google-lead-acceptance-setup.sql once. It creates one synthetic
   application User (no email/password/auth profile/session) and two visibly named
   synthetic Schools with no Google/Instagram connections or keywords. Existing
   active administrators can select them; ordinary managers gain no access.
   They are temporarily ACTIVE for the real dashboard selector, so admins will
   see the two clearly labelled test schools during acceptance.
4. Approve merging PR #5 at that exact HEAD into main and the resulting Vercel
   production release. Verify the resulting tree/commit and deployment metadata.
   This exposes the tested new UI to customers; it is not a private preview.
5. Use the existing approved administrator browser session, with only the two
   fixture school IDs, to record at most ten synthetic leads. Verify inquiry ->
   scheduled -> held -> enrolled, refresh, page navigation, fresh browser load,
   period counts and A/B separation. Inspect matching records through an independent
   Supabase SQL session to prove persisted state across clients/processes. No
   customer school is used for test writes. Check duplicate clicks and failure
   recovery; independent SQL verifies uniqueness/CAS/check constraints. Distinguish
   real-browser/SQL evidence from isolated negative HTTP/auth tests in the report.
6. Run scripts/sql/google-lead-acceptance-cleanup.sql: soft-delete only those fixture
   leads and archive only those two schools after identity/count checks. The
   synthetic no-login owner remains as audit data. No physical deletion. Confirm
   test schools disappear from the selector and customer digests/counts are intact
   or investigate legitimate concurrent customer edits before drawing conclusions.
7. Authorize conditional application rollback to the exact preceding deployment
   above if deployment/acceptance fails. Stop writes to fixtures, archive them,
   preserve new DB columns and all real records, and report evidence.

No new project, credential, auth user, paid API, subscription, notification or
provider write. Cost is existing Vercel build/runtime and small DB reads/writes;
no additional service is being purchased. If actual login requires new credentials,
permission changes or redirect configuration, stop and report before doing it.

## Concrete rollback procedure (only after approval)

- Reconfirm the previous deployment ID/URL and current production aliases.
- Run `vercel rollback school-os-vxhuv96o1-invincible20252dice-2177s-projects.vercel.app`
  in the authorized team/project context. Verify the app aliases now resolve to
  that READY deployment and source SHA a17040c; inspect sign-in and read-only pages.
- Vercel rollback disables automatic domain assignment for later pushes. Restore
  normal promotion only after the fixed candidate is reviewed and explicitly
  approved; do not silently resume it.
- Create a revert/fix PR for the merged application change as appropriate and run
  CI. Do not reset or force-push main. Do not run a reverse/destructive migration.
- Archive/soft-delete the exact acceptance fixtures with the checked cleanup SQL.
  If its identity checks fail, stop rather than broadening the WHERE conditions.

## Remaining release risks / truthful completion gate

The actual new Prisma/Vercel/Supabase write path, production browser reload and
real deployment are NOT RUN until the bundle is approved. Isolated E2E uses
synthetic APIs, PGlite uses a test Prisma transport, and neither certifies live
OAuth/session behavior or real Prisma connectivity. This packet must be updated
with final CI and real acceptance evidence; do not call the whole task complete
while that acceptance is missing. Database process restart is not proposed;
independent browser and SQL sessions verify cross-process persistence.

Main branch protection is currently absent and must be resolved before release;
workflow success alone does not prove those settings. No new credentials are required by
the proposed path. A Vercel sensitive-variable decrypt probe was rejected by
automatic approval review and not executed. Browser project metadata and the
Supabase connector supplied the needed read-only information without decryption.
