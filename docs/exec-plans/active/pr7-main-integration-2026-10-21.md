# PR7 integration with latest main

## Scope and baseline

- PR7: be0c28e240a544345685c1f5f11f917ec63adba8.
- Main: fdca0da5229193acf9c592522c5ec23278f37e80 (PR21).
- Normal merge of main into the existing PR7 branch; never merge PR7 into main here.
- Preserve latest security/access controls, inquiry operation recovery, and PR7 search-demand recovery tests.

## Conflict resolutions

- e2e/fixtures.ts: keep main's synthetic inquiry server, operation barriers and identity tracking; add PR7 demandFailure state and response behavior.
- vercel.json: union only exact false branch entries already in the two parents; no new branch authority, wildcard, true entry or build change.
- scripts/tests/verification.test.mjs: assert the same exact union; retain all safety assertions.

## Validation

- Existing PR21 recovery, security and diagnostics scenarios jointly exercise the merged fixture.
- Run tooling, typecheck, lint, full unit/integration with unchanged coverage gates, plain build, desktop/mobile E2E before commit/push.
- Review fixed merge SHA independently; confirm both parents and preservation of latest main auth/product code.
- Normal push only after exact target deployment suppression and remote-head confirmation.
- Confirm push and pull_request CI at final SHA; record Vercel alias/deployment observations outside source.

## Boundaries

No new production code or SQL authored. No main merge, real OAuth, deployment, migration, database/secret/customer-data changes. Configuration resolution only preserves the union of existing parent exact-false entries; no new branch suppression or platform setting is introduced. Local tests use mocks. Production aliases must remain unchanged. PR22-25 belong to separate lanes and remain untouched by this integration.
