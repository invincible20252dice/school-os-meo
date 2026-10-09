# School OS development

This is the highest-priority repository-local development policy. Follow it on
every School OS task, subject to system/developer instructions and newer explicit
task-specific user restrictions. Historical ExecPlan approval notes do not
override this policy. If a safety condition cannot be proved, stop the affected
operation, report the smallest missing decision, and continue safe work.

## Identity and product

- Before edits run `git remote get-url origin` and `npm run codex:preflight`.
  Required origin: `https://github.com/invincible20252dice/school-os-meo.git`;
  package: `meo-aio-school-saas`. On mismatch, stop without editing.
- School OS is: 「Google集客で『次に何をすればいいか』が分かり、Google経由で何件の面談が生まれたかまで分かる学習塾特化SaaS」.
  Connect analysis -> issues -> NEXT ACTION -> execution -> results -> inquiry
  -> interview. Do not stop at data display. Judge features by whether they help
  schools know what to do next to increase Google-sourced inquiries/interviews.
- Read [PRODUCT_PRINCIPLES](docs/PRODUCT_PRINCIPLES.md), relevant
  [ARCHITECTURE](docs/ARCHITECTURE.md) and [DEVELOPMENT_RULES](docs/DEVELOPMENT_RULES.md).
  Inspect related code/tests and impact first; reuse existing behavior.
- For large, DB or cross-module changes, create an
  [ExecPlan](docs/exec-plans/README.md) in `docs/exec-plans/active/` before editing.

## Autonomous workflow and preapproved work

- Investigate -> assess impact -> implement -> typecheck -> lint -> unit/integration
  tests -> build -> Playwright E2E -> GitHub Actions. Follow
  [School OS Verification](.agents/skills/school-os-verification/SKILL.md) and run
  `npm run codex:verify`. On failure investigate, safely fix and reverify without
  repeatedly asking about ordinary test/implementation errors.
- Preapproved: code reads/edits, feature branch creation/push, PR creation,
  automated checks above, CI inspection/fixes, read-only DB/schema/count/log
  inspection, Vercel Preview, small INSERTs needed by normal application flows,
  and minor UI improvements within the existing specification.
- This does not authorize arbitrary production test/seed rows. E2E uses isolated
  test data and no paid API calls. Preview must not migrate or write test data to
  production. Inspect Git auto-deploy behavior before pushing.
- Batch related reads, especially Supabase SELECT/schema/count checks in one
  read-only SQL where feasible; batch Vercel/GitHub status reads too. Prefer local
  verification scripts. Never use write tools for read-only checks. Do not repeat
  already granted approvals or split same-purpose operations unnecessarily.

## Conditional production authorization

Main merge, Vercel production deploy, additive migration and production smoke
tests are preapproved ONLY when ALL are verified for the exact release:
1. CI and E2E passed for the commit being released.
2. No existing data deletion or destructive DB change.
3. No authentication/authorization model change.
4. API costs remain within an explicitly established cap (unknown is not zero).

Check current schema/data counts, constraints/locks, environment and rollback
before an additive migration; verify data preservation afterwards. Prefer existing
schema; otherwise use CREATE TABLE, ADD COLUMN, CREATE INDEX, ADD CONSTRAINT/FK
or RLS preserving the existing authorization model. Never rewrite applied
migration history. Static SQL checks alone do not prove safety. On production
without Prisma migration history, do not run Prisma migrate deploy/reset/db push,
Supabase db push or all historical migrations; review the single additive SQL.
Conditional approval never overrides the prohibitions or approval gates below.

## Stop and ask

Ask once, bundling related decisions, for: destructive schema changes involving
data migration; API key/secret creation, change or deletion; authentication or
authorization model changes; a new paid external API contract; costs above the
established cap; product or pricing changes; customer-data processing policy
changes; bulk UPDATE/DELETE. Missing account/billing settings are not permission
to enable them. The forbidden operations below remain forbidden.

## Always protect

- Never DROP TABLE, DROP COLUMN, TRUNCATE or DB reset. Never initialize or erase
  existing data to solve a problem or delete production data without authorization.
- Maintain existing schoolId isolation and authentication/authorization on every
  read/write. Do not mix schools or trust client scope as authorization.
- Never reuse ai-tutor or another project's secrets. Never expose API keys,
  DATABASE_URL or secrets in replies, terminal logs, git/commits or screenshots.
- Distinguish unmeasured, successful zero, failure and missing settings. Do not
  manufacture success, lower 95% coverage gates or hide failing tests. Mock/CI
  success is not evidence of a live API/DB/UI flow.
- Do not report completion before required tests, CI and E2E finish successfully.
  Safely fix and rerun; otherwise report the concrete remaining blocker.

## Final report

Keep it brief: 【変更内容】【検証結果】【既存データへの影響】【残課題】
【ユーザー判断が必要なこと】. Include relevant files/results, not large internal logs.
