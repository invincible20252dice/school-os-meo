# Google results: isolated API / SQL acceptance

Follow-up to completed `google-results-refresh.md`, on the same draft PR #5.
Base: `9ea9e94`; previous UI acceptance remains a separate completed scope.

## Objective and boundaries

Connect existing route, access checks, store and aggregation to the exact
GoogleLead migration in ephemeral PGlite. Replace session identity and Prisma's
transport only; translate actual store arguments to parameterized SQL. Verify
registration, meeting persistence, repeated reads, tenant isolation, duplicate
requests, optimistic concurrency and failure recovery without inflated counts.
No production connection, migration, customer data, provider call or attribution
change. PGlite is not evidence of live Prisma/Supabase transport or RLS policies.

Inspected route/access/store/domain/schema tests, architecture, testing guide,
AGENTS, product principles, development rules and verification skill. Consumers
and production code remain unchanged unless a reproducible ordinary bug appears.
No additive migration is needed. Approval is still required for concrete
production migrations/deployments; merge is outside this task's authorization.

## Acceptance

- [x] Actual handlers and SQL persistence, including failures and cross-school IDs.
- [x] Targeted tests; review adapter boundaries and resulting SQL records.
- [x] Full codex:verify without weaker thresholds.
- [x] Push existing feature branch, update draft PR #5, exact-head CI.
- [x] Document product gaps separately from unverified production behavior.

## Findings

Seven acceptance cases now pass, including actual SQL uniqueness and conditional
version updates. No additional product defect was found. Initial month-boundary
failure was in the test transport: PGlite parses TIMESTAMP without timezone in the
host timezone, unlike the UTC Prisma boundary. Explicit UTC parsing corrected
this; targeted acceptance also passed with TZ=UTC. Initial typecheck rejected
ordinary async mocks as Prisma fluent promises; isolated the mock transport type
instead of changing production types. Neither failure required a product change.

Product gaps: automatic attribution, scheduled/held distinction and enrollment
need separate requirements. Verification gaps: real Prisma engine, Supabase
sessions/RLS roles, production persistence and process restart remain untested.
The tests perform fresh GETs against retained isolated SQL records, not a database
process restart. Browser reload remains synthetic API coverage from the prior fix.

Full local codex:verify passed: 9 tooling tests, 161 Vitest files / 1,929 tests,
typecheck, lint (six existing warnings), build and 30 desktop/mobile Chromium E2E.
Coverage: 99.24% statements/lines, 97.40% branches, 99.77% functions.
No thresholds or exclusions changed. Git diff whitespace check passed.

## Completed acceptance / release gate

Implementation commit: `9bff25b21b8ead468dcfaa3a28bd7ce88267f9ed`.
Draft PR #5: https://github.com/invincible20252dice/school-os-meo/pull/5
Exact implementation-head Linux PR CI completed successfully:
https://github.com/invincible20252dice/school-os-meo/actions/runs/37916506294
Documentation-only follow-up heads require their own CI; the final task handoff
records their exact SHA/run rather than attributing this run to another commit.

Vercel read-only deployment history still showed production main at `a17040c`.
This feature branch remains deployment-disabled. No merge, deployment, Supabase
read/write, new project, credential change or paid provider invocation occurred.
No application/SQL migration rollback is needed for this test-only follow-up.

Next safe task: investigate an ephemeral local PostgreSQL setup for real Prisma
engine acceptance, without production credentials or a new Supabase project.
Do not describe PGlite fresh reads as real Prisma or restart durability evidence.
Production acceptance and any release decision remain separate.

Approval boundaries in this checkout: AGENTS lines 16-20 stop production data
changes and require explicit concrete migration/deployment authorization;
DEVELOPMENT_RULES lines 53-59 require exact commit/environment/schema/rollback
review and main PR/status controls. These rules do not impose a blanket approval
requirement on read-only production inspection; preserve school authorization
and secrets, and distinguish SELECT/metadata reads from writes. None was needed
against production Supabase in this task. Merge is not authorized by the PM's
current development request, regardless of passing checks.

Screenshot follow-up: the rerun mobile recovery screenshot shows the fixed help
button overlapping the Web +1 control at the iPhone 13 viewport. Record this as a
separate existing UI usability issue, not a failure of SQL acceptance. The next
small product fix should reproduce the overlap in that viewport, adjust the help
placement/flow, and add an actionable-control E2E assertion. Real Prisma engine
acceptance remains the next infrastructure verification gap after that UI fix.
