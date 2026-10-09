# Safe search-demand failure diagnostics

## Objective and boundaries
Prevent failed Google search-demand acquisition from supplying apparently current
NEXT ACTION evidence. Keep manual GoogleLead inquiry/milestone routes unchanged.
No production calls, synchronization, OAuth changes, schema changes, new storage,
logging service or deployment. Branch codex/google-data-diagnostics starts from
main 2bc8685fb6bbcc7647884432c704938099cd950c; PR #6 stays separate/unmerged.

## Inspection and changes
Inspected challenge-data, challenge-next-actions, action-guides, keyword loader,
their tests and isolated browser fixtures. Normal failures already yield null
demand, but recommendation consumers trust retained rows even with failure status.
Cached failures can also expose an old success fetchedAt. Existing keyword logs
spread provider diagnostics, including raw error messages and arbitrary DB codes.

Use one status-aware topic selector; keep failed/unknown demand distinct from a
successful empty response. Add allowlisted stage/HTTP diagnostics to existing
current-response Snapshot/UI and logs (the new stage field is stripped from
persisted baseline/after snapshots), strip raw provider data from fresh/cached diagnostics, keep
existing stored rows on failure without returning them as current measurements.
No raw responses, tokens, URLs, personal data or identifiers in diagnostic logs.
Existing authentication/school scopes and bounded requests stay unchanged.

## Checklist and acceptance
- [x] Implement sanitized diagnostics and failure-aware recommendation boundary.
- [x] Test cached failure/stale rows, OAuth 400, quota 429, malformed/network/DB
  failures, successful empty results and no secret leakage.
- [x] Desktop/mobile E2E shows information shortage and manual fallback, then
  school switch/reload restores healthy demand without writing records.
- [x] Full local codex:verify.
- [x] Feature branch pushed and draft PR #7 created. No deploy/merge.
- Exact-head CI is the review gate; final run IDs/results are maintained in PR #7
  rather than recording a self-referential commit SHA in this document.

Live performance error cause remains unconfirmed. Search-demand diagnostics do
not assert that its prior OAuth failure proves the performance endpoint cause.

## Verification notes
Initial E2E assumed the weekly ActionPanel appeared on the daily page, then used
an ambiguous navigation link shared by sidebar/main. Corrected the target to the
actual daily-to-weekly navigation; focused desktop/mobile cases passed. Added a
shared daily notice so data shortage is visible without opening the guide. No
retry/timeout relaxation or skipped assertions. React review: pure shared notice,
existing CSS Module/status role, no new effect, request or state subscription.

Final local verification passed: typecheck, lint, 165 test files / 1,968 tests,
coverage gates (99.24% statements/lines, 97.44% branches, 99.77% functions),
production build and all 34 isolated Chromium desktop/mobile E2E cases.
Desktop/mobile failure screenshots visually inspected. Initial E2E failures above
were fixture-navigation issues and are fixed; no checks skipped. Live providers,
production DB and deployment are not run. Next: review draft PR and exact-head CI;
production release requires separate explicit approval.

Implementation and local acceptance complete. Draft PR: https://github.com/invincible20252dice/school-os-meo/pull/7
Remaining review gate: confirm both push and PR CI for the latest head before
approving a release. Production root-cause investigation is a separate task.
