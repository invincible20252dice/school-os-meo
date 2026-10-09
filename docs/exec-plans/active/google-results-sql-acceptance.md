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
- [ ] Push existing feature branch, update draft PR #5, exact-head CI.
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
