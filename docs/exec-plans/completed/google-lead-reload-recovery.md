# Google inquiry recovery after same-tab reload — PR21

## Scope and authorization

2026-10-14: parent PM provided explicit user approval to extend PR21 from
`d5f4cb3ca103acdbd1e6db3e92a3c24754d877ae`. Keep +1 as a new inquiry;
separate status confirmation and explicit same-key retry after an uncertain save.
No main merge, deployment, production access, DB/schema/migration, auth-method,
environment/secret or paid-service change. PR19 / PR15 / PR16 remain isolated.
The reproduction branch `codex/google-lead-reload-repro` is evidence only.

## Inspected behavior

The current client holds one key per school/channel only while mounted. A saved
POST followed by 503 and full reload loses that identity. +1 then creates a new
row. The existing unique(schoolId,idempotencyKey) upsert works, including late
commits. POST409 can indicate an edited/deleted row and is not generic success.
GET lists only the latest 20 undeleted period rows, so it cannot resolve a key.
GoogleLead has no creator. Existing logout link routes to login; its underlying
auth behavior is deliberately out of scope.

## Proposed minimum

- Reserved versioned operation keys bind opaque authenticated user UUID and
  channel plus a random UUID. POST enforces ownership for the reserved namespace;
  legacy ordinary keys stay compatible. This avoids schema/secret changes.
- Read-only status API reuses approved-user and school authorization, rejects
  foreign/legacy/malformed keys before DB lookup, and returns only absent, saved,
  changed or deleted. No row/customer data is returned. Absence is a snapshot,
  not proof that an earlier in-flight POST cannot commit.
- Only unresolved-operation metadata is kept in this tab's sessionStorage:
  operation key, opaque user ID, school ID, route, start time and state. Maximum
  retention 24 hours from original start; no extension on retry. Strict parsing;
  no names, contacts, free text, tokens, cookies or secrets. Original channel is
  encoded in the operation key. Multiple uncertain operations are distinct.
- Reload performs status GET only. Explicit same-key retry is separate from +1.
  A new +1 with any pending operation needs the three-choice confirmation.
  Known saved/changed/deleted resolves without a new POST; unknown409 stays
  unresolved. No automatic POST, new-key retry, count increment or row recreation.
- Clear/invalidate only this feature's metadata on expiry, cancellation, logout,
  identity/school/route mismatch. Preserve other storage/auth behavior. Reject
  copied opener state. Storage refusal must fail safely and visibly.
- Guard stale responses and user/route/school changes, including after cancellation.

## Work / verification checklist

- [x] Repository identity, rules and baseline clean verified.
- [x] Implement key-bound read-only status and server tests.
- [x] Implement strict same-tab storage and disposal tests.
- [x] Implement explicit recovery UI and race/regression component tests.
- [x] Desktop/mobile E2E with synthetic shared server evidence; no live OAuth.
- [x] Run npm run codex:verify without lowering 95% gates.
- [x] Independent review; address actionable findings; rerun required checks.
- Post-commit release evidence: commit/push this verified tree to the existing PR21 branch; record final HEAD/tree and both CI checkout identities in the PR body. These immutable identifiers are recorded after this document is committed, avoiding self-referential commit hashes.

## Acceptance and boundaries

Cover normal save/reload; committed-response-loss; explicit server cancellation
before commit; POST200/listGETfailure; same-key retry including late commit;
confirmed fresh +1; known/unknown409; user/school/route separation and stale
responses; 24h expiry; feature-only logout cleanup; invalid/storage-denied/copied
opener state; multiple pending operations; existing lead lifecycle regressions.
Use local Chromium desktop and mobile viewports, synthetic API state and isolated
PGlite/route tests. Passing them does not certify live auth/provider/production DB.

## Results and remaining work

Implementation, local aggregate verification and independent review completed on 2026-10-14. No production operation is authorized. Exact final commit and post-push CI evidence are maintained in PR21; this plan records the verified implementation and local evidence.

## Implementation decisions / review notes

- `gr1_` key format is 71 characters, below the existing 80-character bound.
  It encodes canonical UUID owner, a one-letter channel and random UUID nonce.
  Existing arbitrary legacy keys can still be posted; they cannot use the new
  status lookup. Reserved keys must match server-verified user and original channel.
- Recent-list and POST responses omit idempotencyKey because the new namespace
  embeds internal user identity; the existing UI does not need that field.
- `confirmed` means a POST was acknowledged; metadata remains until the follow-up
  list read succeeds or the state API resolves it. Thus POST200/listGETfailure
  can still be checked after reload. It never triggers automatic resend.
- Storage refusal blocks new registration before POST and shows a reason. When
  browser policy denies removal, in-document recovery is invalidated and the
  failure is surfaced; physical deletion of inaccessible storage is not claimed.
- Only an initial navigation explicitly identified as reload may restore saved
  metadata. New navigation (including opener copies), history restoration and
  missing navigation evidence discard it. This is not cross-tab synchronization.
- Same-school readers do not gain another user's state lookup, including admins.
  Recovery owner binding is not an authorization substitute: every route still
  rechecks bearer identity, active profile and school access on the server.
- Independent review caught a stale-scope update potentially clearing newer
  context metadata. Storage now rejects an old-context update without changing
  the new context. Regression coverage is required.
- Logout cleanup removes only this feature's metadata. The existing logout link
  and all Supabase sign-in/sign-out behavior remain unchanged; this work is not
  acceptance of the separately stopped live OAuth/logout investigation.

## Documentation consulted

- [Supabase onAuthStateChange](https://supabase.com/docs/reference/javascript/auth-onauthstatechange),
  plus the installed SDK source: synchronous cleanup callback, no awaited auth call
  inside it. Supabase changelog HTML checked; Markdown index was unsupported by
  the web fetcher. No SDK upgrade or auth settings change is required.
- [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)
  and [navigation type](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceNavigationTiming/type):
  reload retention and opener copy motivate the explicit navigation gate.

## Verification history

- Backend targeted: 77 unit/route/SQL tests passed; storage/guard: 51 passed;
  final client: 63 passed, independent 95% coverage gates retained.
- Aggregate attempt 1: typecheck, lint, 2,170 tests (173 files), coverage and
  plain build passed; E2E 85 passed / 1 failed. All 36 new recovery cases passed.
  The existing mobile help/control hit-test failed after repeated registrations:
  transient recovery content above the controls disturbed scroll position and
  the fixed header obscured +1. Trace/screenshot retained under local evidence.
- Fix: place recovery content below registration controls, and return notices to
  the registration area (independent fallback when list data is unavailable).
  Do not center-scroll around the failure, weaken the nine-point obstruction
  assertion, remove real taps or skip the narrow viewport test. Existing E2E
  assertions remain intact. Component 63/typecheck/lint rerun passed.
- Earlier aggregate attempt 2 passed 2,170 tests and 86 E2E before the final two UI fixes. It is superseded by the fresh final verification below.
- Vercel connector read returned 403. An existing cached Vercel CLI, using its
  own authorized account and the same explicit team/project, successfully read
  this branch's deployments: zero, with no next page. Branch auto-deployment
  remains disabled in the unchanged vercel.json. No deployment/settings/env access.
- Ordinary Chrome and live OAuth have not been used. All browser verification
  uses dedicated local Playwright Chromium with synthetic identity/API data.

## Final handoff verification (2026-10-14)

- Preserved all inherited uncommitted implementation and tests; origin/package
  preflight passed on `codex/google-lead-retry-keys`, baseline `d5f4cb3`.
  `docs/AUTONOMOUS_PM_POLICY.md` is absent. No unrelated rollback work was added.
- Final UI fixes distinguish sending from acknowledged-save/list-refresh and keep
  PATCH/DELETE failure feedback inside their modal dialogs. Five added component
  cases bring the final total to 2,175 unit/integration tests across 173 files.
- Fresh aggregate attempt 1 passed typecheck, lint, coverage and build, then failed
  browser startup because this execution environment lacked the Playwright binary.
  Installed dedicated Chromium under `/tmp/school-os-playwright`; no test changes.
- Fresh aggregate attempt 2: `PLAYWRIGHT_BROWSERS_PATH=/tmp/school-os-playwright
  npm run codex:verify` passed tooling, migration safety, Prisma client generation,
  typecheck, lint, 2,175 tests, plain build and 86 E2E (43 desktop / 43 mobile).
  Coverage statements/branches/functions/lines: 99.27 / 97.50 / 99.78 / 99.27%.
  Existing 95% gates and hit-test assertions remain unchanged. Existing lint/build
  warnings remain outside this change; no new blocking failures.
- Fresh 36 synthetic server-evidence records show response-loss/reload stays at
  one POST/one insert; same-key explicit retry and delayed commit use two POSTs
  but one insert; GET failure retains one unresolved key; confirmed new inquiries
  alone create distinct rows; known409 never recreates deleted rows. Desktop and
  mobile agree. Generated 76 screenshots total (60 Google-related); desktop/mobile
  uncertain-state screenshots were visually inspected, with readable recovery
  controls below registration buttons. All 86 browser interactions passed.
- Independent read-only code review covered storage validation/expiry/opener,
  ownership and school authorization, +1 confirmation,409, late responses,
  multiple operations and feature-only logout cleanup: no actionable finding.
- Evidence retained in the handoff workspace `pr21-final-evidence/`: final logs,
  coverage summary, full Playwright report/screenshots and extracted
  `recovery-server-evidence.json`. Earlier logs/CI are not used as final proof.
- DB/schema/migration and existing production data: unchanged. No customer
  payload/browser secret storage, auth-method change or automatic resend.
  Live provider/Prisma transport/production acceptance, main merge and deployment
  remain separately authorized follow-up, not covered by synthetic tests.
