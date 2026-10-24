# Monthly report display state correction

## Scope and acceptance

Base: main `fdca0da5229193acf9c592522c5ec23278f37e80`.
Branch: `codex/monthly-report-state`. Root owns implementation; independent review follows a fixed local SHA.

Only the monthly report page changes product behavior. Loading, failed requests,
missing/incomplete payloads and school/month switches must not display sample
scores, ranks, metrics, comments or actions. A complete successful report,
including actual zero, remains intact. Late responses cannot overwrite the
current selection. The fixed GBP comparison is replaced by an unavailable notice.

Inspected: report/page.tsx, mock/reportData.ts, mock/insightData.ts,
dashboard-reports.ts, reports API route, existing component and browser fixtures,
architecture, development and verification rules. Existing school authorization,
server aggregation, score calculation and AIO contracts are unchanged.

## Remaining API limitation

The successful reports API currently substitutes zero for absent metrics, can
use a fixed school baseline and latest stored report fallback, and still consumes
legacy AIO summaries. This page cannot distinguish those values from measurements
in the existing response contract. It does not claim to resolve that limitation,
recalculate partial scores or alter comparison periods. That requires a separate
API/data-contract task before claiming full measurement provenance.

## Progress and evidence

- [x] Existing worktree/branch inventory checked; no duplicate report work.
- [x] App worktree creation failed with "Not a git repository" at the chat root.
  No partial worktree or branch existed. Normal git worktree creation from the
  existing shared bare repository succeeded; no new repository was created.
- [x] Correct origin and codex:preflight passed.
- [x] TDD: 20 component cases, 19 failed / 1 passed before implementation.
- [x] First implementation: all 20 component cases pass.
- [ ] Full codex:verify, desktop/mobile interaction and screenshot inspection.
- [ ] Independent fixed-SHA review and any required corrections.
- [ ] Publication after deployment suppression is demonstrably authorized.

Evidence directory outside checkout: outputs/monthly-report-state, relative to
the parent chat workspace. Commands: NODE_ENV=test npm test -- report/page.test.tsx;
PLAYWRIGHT_BROWSERS_PATH=<existing local cache> npm run codex:verify.
Browser/API data are synthetic; no live OAuth/provider/DB acceptance is claimed.

## Publication boundary

The new branch is not listed in main's vercel.json deploymentEnabled false map.
Existing branch-specific suppression approval does not authorize adding this
branch. Keep vercel.json unchanged and stop before push/PR creation unless that
exact suppression is separately authorized. No main merge, production deployment,
aliases, schema/data, auth settings, environment variables, secrets, billing,
Jev calls or browser/CUA operations. PR24/25 are out of scope and untouched.
