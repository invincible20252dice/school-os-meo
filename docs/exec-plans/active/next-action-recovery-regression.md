# Persist same-school NEXT ACTION recovery regression coverage

## Scope and evidence

PR #7 at ff6d0da4e05f838b23db6f351126e4283e8af7c6 already implements
failure-aware search-demand recommendations. Its push/PR CI passed. Its checked-in
browser test covers failure/reload and switching to another healthy school.
The existing review-only recovery-unit.test.ts and recovery-e2e.spec.ts under the
2026-10-09 task evidence cover same-school recovery, but are outside normal
Vitest/Playwright discovery. Promote that work into the existing suites rather
than implementing a second recovery mechanism.

## Acceptance

- [x] An expired API failure with retained successful rows recovers to AVAILABLE
  or EMPTY, replacing rows, fetchedAt and diagnostic state for the same school,
  location and month; the next cache read makes no extra provider request/write.
- [x] Desktop/mobile daily and weekly views keep failures distinct from normal
  zero results, suppress retained topics, and show only recovered state after
  same-school reload, including successful EMPTY.
- [x] Browser fixtures account for intercepted requests, reject mutations, and
  permit no unmocked external communication.
- Final gate: codex:verify and independent fixed-SHA review. The exact SHA, final
  result and screenshots are recorded in the native task's output receipt, rather
  than embedding a self-referential commit SHA here.

## Boundaries

Local branch codex/next-action-recovery-regression is based on the exact PR #7
head. Existing PR/worktrees are untouched. Production code, schema, data, auth,
environment and dependencies are unchanged. Tests mock provider/Prisma transport;
browser fixtures do not prove live Google, OAuth or production DB acceptance.
No new branch deployment suppression is approved. Existing false entries do not
match this branch, so configuration changes, push and new Draft publication stay
on hold. Do not reuse another branch's suppression or retry known API 403s.

## Validation

Use the existing School OS verification skill and isolated runner. Package lock
matches the existing checked checkout; copy installed dependencies without copying
dotenv. Record final commands/results and fixed-SHA review in local output evidence.

## Local implementation and targeted results

Two table-driven unit cases extend the existing keyword suite; two browser
scenarios run in both standard desktop/mobile projects. Reused the review-only
tests and added a fresh failure-cache read, exact query scope, no extra upsert,
successful EMPTY browser recovery, and accounting for custom intercepted GETs.
No production implementation fix was necessary.

Focused unit suite: 48 passed. A temporary mutation retaining old fetchedAt
caused both new cases to fail; the original source bytes were restored. This is
test sensitivity evidence, not a discovered baseline production defect.
Initial aggregate typecheck caught a PrismaPromise mock signature mismatch;
the cast now sits at the mocked transport boundary. The subsequent aggregate
passed typecheck, lint, 1,971 unit/integration tests, coverage and plain build.
Its four new browser cases initially selected the DAY1 guide. Targeting the
DAY5 detail region fixed that test error without changing the product or relaxing
assertions. The complete focused diagnostics browser suite then passed 6/6.

Final aggregate verification and independent review are required after freezing
the commit. Native task receipts live under outputs/next-action-recovery-2026-10-18.
This plan stays active for the explicit publication hold; local acceptance and
unperformed GitHub/deployment operations are reported separately in that receipt.
