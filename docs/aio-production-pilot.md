# Vercel runtime AIO pilot

## Approval boundary

The user approved pushing codex/aio-linux-verification for Linux Actions verification
on 2026-10-09. No main merge, production schema change or deployment is approved.
Vercel Git deployment is disabled for this verification branch only; other branches
retain their existing behavior. CI never uses production credentials or writes data.
OPENAI_API_KEY and DATABASE_URL stay in Vercel Secret variables.
Do not export them, change their protection, or build an endpoint to reveal them.
Supabase project: school-os-meo, ref bwqfuzporivryrteinjy.

## Exact scope

- School: iスクール予備校, cms5tnzlr0001jt04qh0lluva.
- Keyword: 熊本 予備校 おすすめ, 94fcdebf-c930-4a34-bfb0-4eddf0ace8e3.
- Provider: OpenAI Responses search, gpt-4.1-mini; not public ChatGPT UI rankings.
- Entry: authenticated /dashboard/aio?schoolId=cms5tnzlr0001jt04qh0lluva.
- POST /api/dashboard/aio requires an active authenticated admin and the exact IDs.
  GET keeps existing school access checks. Client role headers never grant access.
- AIO opts into read-only profile resolution: no invitation acceptance/profile
  writes and no user-editable metadata roles. Existing other routes are unchanged.
- The server supplies one fixed request ID from src/lib/aio-pilot.ts. The unique
  school/request constraint plus transactional advisory lock prevents two tabs,
  different client request IDs, admins or HTTP retries from paying again.
- One new AioMeasurement is reserved and that same row finalized. It is not one
  raw HTTP request: search may be followed by one classification request when the
  school is mentioned. No provider retries. Existing unrelated records stay unchanged.
- Stale RUNNING records are not mass-updated during reservation. Expired state is
  interpreted for display only, leaving earlier records intact for investigation.
- Even failure, missing configuration or interruption consumes this pilot reservation.
  Re-read it instead of automatically retrying. A new paid attempt needs review.
- No expansion, Cron or other provider is enabled by this pilot.

## Read-only production audit

2026-10-08: explicit READ ONLY transactions through authenticated Supabase CLI.
School=5, TargetKeyword=4, AioScoreHistory=0; AioMeasurement absent.
public._prisma_migrations absent. No duplicate (schoolId,id), no orphan keywords.
The only active school with registered keywords is the pinned school above.
DATABASE_URL/Prisma transport and OpenAI runtime have NOT yet been tested.

Production TargetKeyword also has legacy columns and a unique (schoolId,keyword)
index not identical to the local Prisma declaration. Preserve them. Do not attempt
to reconcile the entire Prisma schema. Auth/storage/realtime migration tables are
managed by Supabase and are not application migration history.
Six enabled DDL triggers were inspected. For this SQL only extensions.pgrst_ddl_watch
applies; its inspected body sends the PostgREST schema-reload notification and does
not rewrite application records. The others target extension creation or deletion.

## Proposed SQL, not applied

Apply only [20261008120000_aio_live_pilot.sql](../supabase/migrations/20261008120000_aio_live_pilot.sql)
after separate approval. It is the reviewed AIO-only schema body, matching the new
unapplied Prisma draft, wrapped in a transaction with lock_timeout=3s and
statement_timeout=15s. Do not execute both copies.

- Add one unique index on existing TargetKeyword(schoolId,id). Its existing id PK
  already guarantees uniqueness; still recheck immediately before application.
- Create AioMeasurement, its new-table NOT NULL fields, two foreign keys, status
  and result CHECK constraints, one unique request index and two lookup indexes.
- Enable RLS on the new table, with no browser policies. Server Prisma requires an
  authorized DB role with table access; verify this inside Vercel before a paid call.
- No existing column deletion/type conversion/NOT NULL change or data UPDATE/DELETE.
  ON DELETE RESTRICT is a foreign-key protection, not a data deletion statement.
- Old AioScoreHistory stays untouched and is excluded by the new API.

The index and foreign keys can acquire locks on existing tables. Run at a quiet
time. If the lock/statement timeout fires, stop; do not retry in a loop or increase
timeouts without review. The transaction prevents a partially installed schema.
Recheck table/index existence, counts, constraints and active DDL triggers first.
Do not use IF NOT EXISTS to silently accept an incompatible prior installation.
Never run prisma migrate deploy/reset, prisma db push, supabase db push, seed,
or the legacy database preparation scripts. Do not create/baseline/edit Prisma
migration history as part of this rollout.

## Deployment and acceptance, after approval only

1. Record exact existing counts/schema immediately before approved SQL application.
2. Apply only the reviewed transaction, then verify columns, checks, FKs, RLS,
   indexes and unchanged existing counts. No measurement INSERT at this stage.
3. Deploy only the reviewed, approved commit. Vercel build runs npm run build
   (Prisma client generation + Next build), without SQL preparation. Check any
   dashboard-level build override and installation hooks do not reintroduce SQL.
4. Sign in as an already-active admin. GET the AIO screen to prove Vercel Prisma
   access and empty state before spending. Never log auth headers or secrets.
5. Confirm the pinned school and keyword. Click the measure button once. Inspect
   provider response, citations, detected/recommended flags and nullable failure
   fields. Re-read the same record and confirm only one new AioMeasurement exists.
6. Reload the authenticated screen and verify the same ID/time/response persists.
   Distinguish actual runtime evidence from mocks. Do not log private provider data.
7. Successful false recommendation is 0/1=0%; true is 1/1=100%. Missing data is
   unmeasured, failure is failure and absent settings are configuration-required.
   Error-state coverage uses isolated fixtures, never damaged production settings.

## Rollback without data deletion

Before SQL COMMIT, failure rolls back this transaction. After commit, leave the
new table, indexes and any measurement intact. Do not DROP anything or remove rows.
If code must be withdrawn, obtain approval to redeploy the last compatible version
or an implementation disabling POST; keep the old sample Cron disabled. A fixed
reservation prevents retries while investigating. Do not restore old automated
build SQL behavior without review. Verify unrelated features against the approved
rollback artifact; legacy overview/report AIO consumers still need future cleanup.

## Verification

2026-10-09 Linux CI: [run 37889631653](https://github.com/invincible20252dice/school-os-meo/actions/runs/37889631653)
passed codex:verify on 9fc179929f0a. Tooling 8, typecheck, lint (0 errors/6 prior
warnings), 1,896 unit/integration cases, build and 24 desktop/mobile E2E cases passed.
Coverage: lines/statements 99.24%, branches 97.36%, functions 99.76%. Artifact
11597837340 contains screenshots and reports. Fixes: separate Linux engine
preparation, exact local image/API fixtures, accessible selectors, and mobile header
accessibility/overflow. Final screenshot review adds menu spacing and an overlap
assertion; CI must pass again for the final commit. No external paid API or production
DB write occurred. Production acceptance is still a separate, approval-gated step.

The SQL is executed only in PGlite tests until approval. Route tests cover admin
access, wrong school/keyword and fixed reservation IDs; UI tests cover read-only
users, one-shot state and reload/remount persistence. CI/Linux results and actual
Vercel runtime acceptance must be reported separately, never inferred from unit tests.

2026-10-08 final run: tooling 7/7, Vitest 157 files / 1,891 tests, typecheck, lint
(0 errors, 6 pre-existing warnings), SQL static safety and build passed. Aggregate
codex:verify did not pass because Chromium was denied macOS MachPortRendezvous
permission (1100): one launch failure, 19 browser tests not run. The initial missing
browser path was corrected using the existing School OS browser installation.
No unapproved push was made, so Linux CI has not executed these changes. Browser
acceptance, real OpenAI execution and production persistence remain unverified.

## Files in this revision

2026-10-09 follow-up: src/lib/aio-measurement.ts no longer bulk-updates older
interrupted rows. aio-measurement.test.ts and aio-persistence.test.ts cover all
reservation states and preservation. e2e/core.spec.ts and e2e/fixtures.ts now cover
successful 100%, read-only users, pinned scope and disabled retries after reload.
1,896 unit/integration tests, typecheck, lint, build and SQL safety passed. E2E
remains blocked by macOS Chromium permission 1100 after localhost permission was
resolved (1 launch failure, 23 not run). SQL/schema and production data are unchanged.

- src/lib/aio-pilot.ts: pinned server-only pilot identity and reservation.
- src/app/api/dashboard/aio/route.ts and route.test.ts: admin gate and fixed scope.
- src/lib/supabase-access.ts and supabase-access.test.ts: opt-in read-only profile
  authorization; existing callers retain their behavior.
- src/lib/aio-view.ts, dashboard/aio/aio-client.tsx and page.test.tsx:
  server permission, selection fallback, disabled repeated measurement and states.
- supabase/migrations/20261008120000_aio_live_pilot.sql and
  src/lib/aio-persistence.test.ts: approved-only SQL and preservation tests.
- vercel.json, package.json, scripts/tests/verification.test.mjs,
  src/lib/production-schema-runner.test.ts: no build-time database mutation.
- e2e/fixtures.ts: isolated fixtures reflect the new pilot permission contract.
- docs/ARCHITECTURE.md, this runbook and the active AIO ExecPlan: rollout boundaries.

The AIO/foundation changes are committed only on codex/aio-linux-verification.
This list does not imply they were deployed. Review the full main-to-branch diff
before approving the production SQL, main merge and deployment.
