# Offline evidence receipt adoption

## Objective and boundaries

Add a developer-only pure function that detects incomplete or inconsistent sanitized
verification receipts. It does not authenticate observations or authorize operations.
Reuse the existing `node --test scripts/tests/*.test.mjs` discovery. No application,
authentication, database, external API, dependency, workflow or deployment changes.

## Inspected sources and ownership

Read AGENTS.md, AUTONOMOUS_PM_POLICY.md, product/architecture/development/verification
rules, scripts/codex-verify.mjs, scripts/tests/verification.test.mjs and package.json.
The earlier output-only Python prototype is design evidence, not validation of this
new implementation. Lane C exclusively owns these four new paths:

- scripts/evidence-receipt.mjs
- scripts/tests/evidence-receipt.test.mjs
- docs/evidence-receipt.md
- this execution plan

## Acceptance

- [x] Behavioral failing tests precede implementation; malformed JSON-shaped inputs
  fail closed without throwing or leaking their supplied values.
- [x] Current head/base/tree, review and latest CI attempts are distinguished;
  PR synthetic checkout is never equated with feature head merely by API head SHA.
- [x] Exact branch suppression, Draft/unmerged state and complete alias observations
  are required for a complete receipt, but completeness never grants authorization.
- [ ] Full codex:verify, fixed-SHA independent review and final SHA CI.
- [ ] Existing PR24 remains Draft; normal push only with exact false rechecked.

## Progress and remaining work

2026-10-21: correct origin/package preflight passed; clean starting SHA
7a51875c9314cbc2d9250611fbab5b391143852f. Existing branch suppression is unchanged.
Implementation and 17 new Node tests complete; targeted lint passed. Root prereview
found no issues. The first full verification passed tooling, typecheck, lint,
unit/integration coverage and build, then correctly refused to reuse another lane's
active E2E server on port 4317. No product fix, workflow bypass or server reuse was
made. Rerun the unchanged full verification after explicit exclusive port handoff.
Final validation, commit, CI and independent review evidence are recorded by full
SHA in the cycle's native task output receipt and the existing PR24 record.
This plan remains active until that publication validation completes.
No production migration or live provider verification is needed or authorized.
