# Testing and coverage

Run `npm run test:ci` before deployment. This runs coverage checks followed by
Prisma Client generation and the Next.js production build.

## Measured scope

`vitest.config.ts` measures the existing shared TypeScript libraries, API routes,
dashboard navigation, the reviews, overview and review-analytics client components,
and the survey editor component. It does not measure all
other application pages or components. The database client bootstrap is excluded;
tests replace external database and provider connections at their boundaries.
Test files are not counted as application code.

Lines, statements, functions, and branches must each reach 95% globally. The same
four thresholds also apply independently to these files so aggregate coverage
cannot hide missing coverage in the covered workflows:

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
- `src/app/(dashboard)/dashboard/surveys/[id]/edit/survey-editor.tsx`
- `src/app/(dashboard)/dashboard/reviews/analytics/review-analytics-client.tsx`
- `src/lib/review-analytics.ts`
- `src/lib/review-analytics-ai.ts`
- `src/app/api/dashboard/reviews/analytics/route.ts`

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

## Review AI analytics

Both `/dashboard/reviews/analytics` and `/dashboard/reviews/ai` use the same client
and authenticated `/api/dashboard/reviews/analytics` endpoint. The scope is
non-archived Google reviews in the selected school (or active schools for an
approved headquarters user); manager access is checked against school membership.
No hard-coded school or count is used. The latest 50 records are analyzed, with
the full count, sample size and number of textless reviews shown separately.
`comment` is the synced Google text; `originalText` supports existing records that
store the same source text there. Generated review drafts and replies are never
used as source opinions.

The existing `OPENAI_API_KEY` is required for nonempty text analysis. The Responses
API uses the existing gpt-4o model, strict JSON schema, `store: false`, and a
45-second deadline (route maximum 60 seconds). Only review IDs and source text
are sent, not credentials, profile emails or separately stored author names.
The implementation follows the official Structured Outputs documentation:
https://developers.openai.com/api/docs/guides/structured-outputs
No new database column or migration is needed. Results are computed on demand,
not persisted; refreshing runs a new analysis and may incur provider charges.

Returned IDs must match the input set exactly once. Each opinion must quote a
nonempty, contiguous source passage (up to 500 characters), use an allowed
category/sentiment, and have no duplicate category within a review. Counts and
percentages are calculated in application code, not supplied by the model.
Language tabs count text-bearing reviews; sentiment and category percentages use
the extracted opinion count as denominator. A review can have multiple topics.
AI classification is an interpretation, not an independently verified fact;
source-review links let the user inspect the evidence.

Tests cover real source extraction through the provider response parser and
aggregation, duplicate/foreign IDs, invented quotes, all sentiments/languages,
zero rows, textless reviews, scope isolation, auth failures, provider refusals,
malformed responses, timeout, database failures, retries and stale requests after
switching schools. All four new modules have independent 95% coverage gates.
Mocks replace only external session, database and HTTP boundaries; passing these
tests does not prove production credentials or provider availability. Failures
return explicit errors, never demonstration metrics or successful empty results.

`review-analytics-workflow.test.tsx` connects the rendered client to the actual
GET route, source-text extraction, OpenAI response parser, contract validator,
and aggregation. It checks exact scoped Prisma query arguments and provider
payloads, rendered percentages and source links, language filtering without
another AI call, empty/textless data, expired/pending/cross-school access,
database/quota/configuration failures, invented/omitted/duplicated AI evidence,
explicit retry, the 50-record sampling boundary, and late results after changing
schools. Only identity, database adapters, and external HTTP are substituted;
this is not a live PostgreSQL or OpenAI integration test. The browser contract
also rejects a zero sampling limit or a sample larger than that limit.

Standalone `tsc --noEmit --incremental false` currently reports 144 existing
type errors in other test files (including Prisma mock return types and fixture
shapes). The analytics tests introduce none. A passing production build and
Vitest run must not be described as a passing standalone whole-repository type
check; fixing that existing test-type debt is separate work.

## Survey option editing

The editor retains every line (including trailing empty entries) in its editable
options array. Normalization is applied only to preview, validation, and saved
data, never to a typing event or a reorder operation. DOM tests of the full editor
cover both choice types, trailing Enter, blank lines, whitespace/IME input,
reordering/deletion, save without blur, whitespace-only validation, failed saves,
switching surveys with reused item IDs, and changing question types. Pure tests
verify that preview/save normalization does not mutate the editing buffer. Both
the full editor and the shared survey-builder library have independent 95%
thresholds for lines, statements, functions, and branches.

Additional DOM tests cover loading without editable defaults, all generation
fields, add/reorder operations, create/update responses, missing IDs, denied or
failed requests, duplicate-save prevention, and local list controls. List-control
tests assert client state only; they do not claim those controls persist changes.
Deferred-response tests reproduce stale success/error responses after switching
surveys or schools. Effect cleanup aborts the obsolete request, and aborted
requests cannot overwrite current form data, notices, or loading state. Tests
also cover unmounting during session resolution and during an in-flight request.

`survey-editor-workflow.test.tsx` connects the actual editor, GET/POST routes,
school-scope resolution, persistence normalization, Prisma write arguments,
reloading, and public-question serialization. Only session identity, network
dispatch, and the database adapter are substituted. Create and update tests
verify the selected school, ordered choices without blank lines, and public
question order. These are in-process integration tests, not live database tests.

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
