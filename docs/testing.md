# Testing and coverage

Run `npm run test:ci` before deployment. This runs coverage checks followed by
Prisma Client generation and the Next.js production build.

## Measured scope

`vitest.config.ts` measures the existing shared TypeScript libraries, API routes,
dashboard navigation, and the reviews and overview client components. It does not measure all
other application pages or components. The database client bootstrap is excluded;
tests replace external database and provider connections at their boundaries.
Test files are not counted as application code.

Lines, statements, functions, and branches must each reach 95% globally. The same
four thresholds also apply independently to these files so aggregate coverage
cannot hide missing coverage in the direct-reply workflow:

- `src/app/(dashboard)/dashboard/reviews/reviews-client.tsx`
- `src/app/api/gbp/reply/route.ts`
- `src/lib/gbp-direct-reply.ts`
- `src/lib/review-reply-assist.ts`
- `src/app/(dashboard)/dashboard/overview-client.tsx`
- `src/app/api/dashboard/overview/route.ts`
- `src/lib/dashboard-summary.ts`
- `src/app/api/reviews/route.ts`
- `src/lib/google-gbp-oauth.ts`
- `src/lib/survey-builder.ts`

Reports are generated in `coverage/coverage-summary.json` and
`coverage/coverage-final.json`. Do not lower thresholds or exclude executable
branches to make a change pass.

## Direct-reply regression tests

- Provider tests run the real token-refresh, account discovery, review matching,
  pagination, and reply-serialization code against deterministic HTTP responses.
  They check exact endpoints and request bodies, ambiguous identities, wrong
  locations, malformed responses, authorization rejection, quota errors, and
  retries of already-published replies.
- API tests check approved-user access, school isolation, validation, credential
  selection, and database update ordering. Integration cases connect the real
  provider implementation to the route and verify that Google rejection never
  marks a review as replied. Google success followed by database failure is a
  distinct result, not a successful local save.
- Component tests render the real React component in jsdom and operate its DOM
  controls. They verify edited text submission, disabled controls, failure-state
  preservation, valid empty states, invalid response rejection, edit deep links,
  copy behavior, and stale responses after switching schools. Sync, manual
  completion, and direct publication cannot run concurrently.
- `reply-workflow.test.tsx` connects the actual component, reply API, OAuth/Google
  provider code, database write arguments, and list serializer in one test. Only
  session identity, the PostgreSQL adapter, and Google HTTP are replaced. It
  checks the edited text end to end, quota/permission refusals, reload after a
  draft save, explicit retry, confirmed publication, and a 500 refusal that must
  not mutate storage. These are in-process integration tests, not live-DB or live
  Google posting tests.
- Review API tests use the real school-scope resolver instead of stubbing its
  answer. Missing/inconsistent manager memberships are denied before listing or
  updating reviews; explicit cross-school requests are rejected. Admin access
  remains available without a specific school assignment.

## External verification boundary

These tests do not publish replies to real Google reviews, verify current OAuth
credentials, or prove Google API approval/quota availability. A successful build
and coverage report are not evidence of a successful production Google write.
Production posting must be verified with an authorized account and an intended
reply. Never replace a failed Google request with a fabricated success response.

## Survey option editing

The editor retains every line (including trailing empty entries) in its editable
options array. Normalization is applied only to preview, validation, and saved
data, never to a typing event or a reorder operation. DOM tests of the full editor
cover both choice types, trailing Enter, blank lines, whitespace/IME input,
reordering/deletion, save without blur, whitespace-only validation, failed saves,
switching surveys with reused item IDs, and changing question types. Pure tests
verify that preview/save normalization does not mutate the editing buffer. The
full editor is exercised by these tests but is not added to the measured component
scope; the shared survey-builder library has independent 95% thresholds.

### Quota and permission refusals

Google 429/403 responses during OAuth, account discovery, review lookup, or the
reply PUT save only `aiReplyText` and `aiReplyDraft` for the authorized review.
The API returns `deliveryStatus: DRAFT_SAVED`, `draftSaved: true`,
`googlePosted: false`, and `warning: RATE_LIMITED` or `PERMISSION_DENIED`.
Here `success: true` confirms local draft persistence only, not publication.
Existing `replyText`, `status`, and `repliedAt` remain unchanged. A failed draft
write returns an error instead of claiming that the text was saved.

The UI shows a warning, preserves the editor text, and permits an explicit retry
or copying to Google's management page. It does not automatically retry a
quota-limited write. Google quota/access approval must still be resolved; local
persistence does not bypass Google's restrictions. Tests exercise actual
provider HTTP handling, draft persistence and list serialization, warning UI,
reload/retry, and protection of previously published replies.

## Overview metrics and regression tests

The overview reads the selected school from the URL. An approved manager is
restricted to assigned schools; authenticated headquarters users can request all
active schools. A missing school or failed query never widens the scope or
substitutes demonstration metrics. No schema migration is needed for this change.

- Registered reviews count non-archived `Review` records (including survey
  records, not exclusively published Google reviews). Average rating excludes
  unrated records. Month counts use `postedAt`, or `createdAt` when no posting date
  exists, with Japanese calendar-month boundaries. The displayed comparison is
  the current month to date versus the previous full month.
- Pending replies count `PENDING` and `PENDING_CUSTOM_REPLY` records without a
  reply timestamp. Churn counts distinguish open, in-progress, and unresolved
  high-risk alerts.
- MEO uses the newest `RankHistory` among active `TargetKeyword` records and
  compares only with that same keyword's previous measurement. A null measured
  rank means out of range; no history means unmeasured.
- AIO averages each active keyword's latest `AioScoreHistory`, without counting
  older measurements again. Search terms use the latest stored reporting month
  and sum matching queries across the authorized schools. Unmeasured values are
  null, never fake scores or copied values from another school.
- Tests cover school isolation, denied/pending authentication, empty databases,
  database failures, JST month/year boundaries, ranking comparisons, AIO zeroes,
  query aggregation, and alert-derived actions. Component tests use the actual
  aggregator's response and operate the rendered DOM, including retries and
  stale success/error responses after switching schools.
