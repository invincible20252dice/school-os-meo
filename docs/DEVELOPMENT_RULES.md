# Development rules

## Before changes

Run preflight; inspect git status and preserve unrelated work. Read affected
routes, services, Prisma models, consumers and tests before designing a change.
Use CSS Modules and the existing SVG components. Prefer existing helpers over
parallel implementations. Use an ExecPlan for schema/large/cross-module work.

## Database and migrations

Never delete/reset existing data or use DROP TABLE, DROP COLUMN, TRUNCATE or
other destructive migrations. Do not rewrite applied migrations. Favor additive,
backward-compatible changes. Plan backfills separately with counts, validation,
rollback/recovery and explicit production authorization. Do not automatically run
`db:deploy`, `prisma:migrate`, seed scripts, `vercel-build` or preparation scripts.
Some current build preparation scripts execute SQL; `codex:verify` intentionally
uses the plain build instead. A successful static migration check is not approval
or a proof of data safety; manually review constraints, defaults, locks and costs.

## Authentication and school isolation

Reuse `resolveRequestAccess`, approval checks and `canAccessSchool`. Scope reads,
updates and deletes to an authorized schoolId on the server, not only in the UI.
Never trust query parameters or browser state as authorization. Preserve roles
and memberships. Test unauthenticated, pending, cross-school and admin behavior.
AuthApprovalGate is client-side UX, not a server authorization boundary.

## External APIs and AI

Use existing provider/token helpers. Keep tokens server-side; never log env values,
request headers or unredacted provider errors. Apply deadlines, bounded retries and
rate/concurrency limits. Do not convert 429, quota, timeout or malformed responses
into successful zero results. Do not spend money or publish Google replies in tests.
Distinguish public AI results from model API output and sample responses. Validate
AI schemas and evidence; treat generated content as untrusted. Never manufacture
success or use samples as production measurements.

## Verification and self-correction

Run `npm run codex:verify`: identity, tooling tests, migration safety, Prisma client,
typecheck, lint, existing unit/integration coverage, plain build and browser tests.
Use `npm run codex:verify:strict` to require known product-gap checks too.
No production secrets are needed. See [testing](testing.md) for boundaries.
Do not lower the existing 95% coverage gates, skip newly failing tests, or broaden
exclusions to pass. On FAIL inspect evidence, fix safely, rerun affected checks,
then rerun the aggregate command. Stop when resolution requires production data,
destructive operations, increased billing, auth redesign or major product changes.
Report failures honestly. Known product gaps must be explicit, bounded and removable.

## Deployment and GitHub

Verification does not push, migrate or deploy. Obtain explicit approval for concrete
production migrations/deployments unless already granted for that operation.
Check the exact commit, environment, schema compatibility and rollback plan first.
In GitHub rulesets for main, require pull requests and the `Codex Verify` status,
block force pushes/deletions and avoid bypass permissions. The workflow cannot
configure or prove those settings. Existing Vercel Git auto-deploy settings must be
reviewed separately; this verification-only task does not change them.

## Final report

Report only: changes and files; DB changes; existing-data impact; executed tests;
failures and fixes; build result; remaining issues; production follow-up.
