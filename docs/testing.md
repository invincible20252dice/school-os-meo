# Testing and coverage

Run `npm run codex:verify` before reporting a change verified (`test:ci` is an alias).
It runs repository identity and migration safety checks, tooling tests, Prisma
generation, typecheck, ESLint, existing unit/integration coverage, a plain Next.js
build, and desktop/mobile Playwright tests. It never migrates, seeds or deploys.

## Codex verification setup

Use Node.js 22 and `npm ci --ignore-scripts`, then
`node node_modules/@prisma/engines/scripts/postinstall.js` to install engine binaries
without application hooks or DB access, then `npx playwright install chromium`
(Linux CI uses `--with-deps`). No production credentials are needed. Run from the
School OS repository root. Default E2E URL is fixed to `http://127.0.0.1:4317`;
existing servers are never reused. Stop any conflicting test server before retrying.
`PLAYWRIGHT_BROWSERS_PATH` can point to a writable local browser cache.
If a restricted desktop runtime denies Chromium's macOS Mach IPC at startup,
verification must fail. Run the same command in an authorized ordinary terminal
or GitHub Actions. Do not skip E2E or report browser tests passed in that case.

`codex:verify` supplies dummy loopback credentials, blanks environment-file keys,
and blocks external Node HTTP. The build uses `.next-codex`; normal development
uses `.next`. Browser fixtures abort external/unhandled API requests. API writes
in browser tests operate only on per-test in-memory records. Existing PGlite
tests separately check real SQL persistence, optimistic concurrency and school
isolation. Browser reload tests do not certify production DB persistence.

Migration checks compare the working tree (including untracked SQL) against
`CODEX_VERIFY_BASE` when supplied; otherwise against the merge-base with
`origin/main` (HEAD fallback for local checkouts without that ref). CI supplies
the PR base SHA or push-before SHA, so committed changes are included. Static
checks reject rewritten migrations, destructive SQL and removed/type-changed
Prisma fields. They do not replace manual review of defaults, constraints,
enum changes, dynamic SQL, locks or data backfills.

### Browser coverage and limits

- Google login start and local OAuth redirect; real consent/token issuance is not tested.
- School switch, seven-day challenge, execution save/reload, failed save and refusal.
- Reviews/survey lists and Google connection status with synthetic school data.
- Desktop/mobile interaction and saved challenge screenshots.
- AIO unmeasured/configuration/error states and success + reload + school isolation
  use browser API fixtures. They never call real providers or a production database.
- AIO PGlite tests execute the additive migration and persist results through the
  real measurement service with a test-only Prisma-to-SQL adapter and mocked HTTP.
  This proves SQL constraints/persistence, not Prisma transport or distributed locks.

### Live AIO gate

AIO-001/002 are now normal passing acceptance tests, not expected failures.
The implementation measures one keyword with OpenAI Responses web_search, not the
public ChatGPT UI. A second model request classifies recommendation only when the
school name is detected. Citation and quote validation reject unsupported evidence.
No retry; maximum two API requests (1600 + 500 output tokens) per attempt, one
search tool call, 35-second deadline per request. Search/model usage is billable.
School-level reservations enforce a one-minute cooldown and five attempts per
rolling 24 hours. Missing-key records do not count toward that paid-attempt limit.
The HTTP API additionally restricts measurement to the exact school/keyword and
server-fixed one-shot request ID in `src/lib/aio-pilot.ts`. No other school or keyword
can start a paid attempt. Any existing reservation, including failure/configuration
or interrupted RUNNING, is reused without another provider call.

Required live secrets are OPENAI_API_KEY and DATABASE_URL; DIRECT_URL is unused.
Do not write dummy values to .env.local or copy another project's credentials.
Secrets remain inside Vercel; do not pull/copy them locally. Vercel's 403 means
insufficient access, not absent production configuration. The current user-approved
direction is the existing production Supabase project, not a new test DB. Production
schema application and deployment still need separate concrete approval. After that
approval, follow [the pilot runbook](aio-production-pilot.md): read-only schema/count
checks, then only the reviewed Supabase additive SQL. No Prisma migrate/db push,
Supabase db push, reset or legacy preparation scripts. Inside the Vercel runtime,
measure the pinned keyword once, read the stored result via authenticated GET,
reload the actual AIO screen and confirm the same record/time/content. Record
evidence without credentials. A mock/CI pass is not this live acceptance gate.
Do not automatically retry a paid failure repeatedly. Gemini, Google AI Overview,
multi-keyword aggregation, history, competitors and Cron remain gated; no schedule
has been enabled. Legacy AioScoreHistory remains untouched and is never read by
the new AIO screens/API.

### CI and merge protection

`.github/workflows/quality.yml` runs `codex:verify` on pushes and pull requests
without production secrets or deployment permissions. Reports/traces are retained
for seven days. Configure a GitHub main ruleset requiring the **Codex Verify**
check and PRs, with force pushes/deletions disabled. This needs repository-admin
configuration; workflow YAML alone cannot block merging. Existing Vercel automatic
deployments are separate. `vercel.json` disables automatic deployment only for
`codex/aio-linux-verification`; this branch is for Linux CI, not a production-backed
Preview. Main merge, schema application and production deployment are not approved
by the verification-branch push permission.

## Measured scope

`vitest.config.ts` measures the existing shared TypeScript libraries, API routes,
dashboard navigation, the reviews, overview and review-analytics client components,
and the survey editor and public survey client components. It does not measure all
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
- `src/app/(customer)/survey/[id]/survey-client.tsx`
- `src/lib/survey-respondent.ts`
- `src/lib/public-survey-answers.ts`
- `src/lib/review-generator.ts`
- `src/lib/review-template.ts`
- `src/lib/survey-persistence.ts`
- `src/app/api/generate-review/route.ts`
- `src/app/api/survey-responses/route.ts`

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

Standalone `tsc --noEmit --incremental false` currently reports existing
type errors in other test files (including Prisma mock return types and fixture
shapes). The analytics tests introduce none. A passing production build and
Vitest run must not be described as a passing standalone whole-repository type
check; fixing that existing test-type debt is separate work.

## Survey option editing

### Respondent identity and generated reviews

Every builder preview and public form begins with the same fixed, required
respondent question (`system-respondent-type`). This is application-owned form
metadata, not an editable SurveyItem: old survey IDs and saved question order
remain unchanged, and no data migration is needed. The displayed editable
questions start at Q2; the list count includes the fixed question. No answer is
preselected. The selected identity is persisted in the existing `surveyAnswers`
JSON, and both generation and response-save APIs reject missing/invalid identity.

Generation derives PARENT/STUDENT only from that stable question ID, never the
position or the respondent's free text. The user prompt preserves question/answer
pairs so a high-school name cannot be confused with the tutoring-school name or
an episode. Instructions enforce the selected viewpoint, 150-280 characters,
natural context, and no invented gender, grades, improvement, or school-specific
instruction. Prompt tests verify those constraints; deterministic fixtures do
not prove that every live LLM output is natural or factually correct.

The HTTP Responses API reads message content from `output`, not the SDK-only
`output_text` convenience property (official reference:
https://developers.openai.com/api/docs/guides/structured-outputs).
`buildUniversalReview` in `review-template.ts` uses the configured provider for
all generation. The fixed choice dictionary, school/grade regex classifier,
unknown-choice 422 validation, and template fallback have been removed.
`OPENAI_API_KEY` must be configured in the production deployment before releasing
this change. Missing configuration returns 503; provider/quota/output failures
remain failures and never produce substitute praise. Only sanitized error codes
are logged. No credentials are committed.

Arbitrary free-input school names and new/edited choice text are passed unchanged
along with their question IDs, titles and types. The actual tutoring-school name
is separate. The required respondent answer is resolved by its stable ID, not a
search for parent/student words in serialized JSON or other question titles.
No school suffix is added or removed. Prompt rules require one natural paragraph,
no quoted choice list, no invented experiences and preservation of negative
feedback. The model interprets new question meanings; no choice-word code update
is needed. Provider text is whitespace-normalized into one paragraph.

Tests verify request construction and response handling, not a guarantee of
perfect prose for every possible live input. Successful provider fixtures are
explicit test data. Production release requires a real provider smoke test with
arbitrary school names and newly added choices. The existing answer-save flow
persists the returned draft only after generation, without schema changes.

`respondent-workflow.test.tsx` drives the actual public DOM and generation/save
routes, substituting only provider HTTP and persistence. It verifies unselected
Q1 blocking, both roles, high-school text context, stored identity in both rating
paths, and preservation of input on provider/configuration errors. Generator,
universal generation engine, respondent
contract, generation route, public client, answer aggregation, persistence, and
response-save route each have independent 95% coverage gates.

`natural-review-workflow.test.tsx` extends that boundary through the real
persistence implementation; only Prisma and external provider HTTP are replaced.
It verifies provider-output preservation for both roles, school-scoped write
arguments, stored answers, clipboard text,
the configured review URL, and changing respondent roles on the same form.
Regression cases use arbitrary schools, new options, and school/grade answers,
including student responses to forms containing a parent's question title.
Required-only submissions reach the provider without a choice-word gate.
School lookup and response-write failures must preserve input, hide the posting
button, expose no database details, and allow an explicit retry. Validation
failures must not query or write the database. These tests do not write to a live
database or post a Google review.

`survey-client-dom.test.tsx` operates the real public form with only HTTP and
browser clipboard/window boundaries substituted. Tests cover role replacement,
multi-choice limits and deselection, free text, encoded request IDs, delayed
loading, missing/malformed data, network failure, timeout, late success/failure
after changing surveys, save failures and retry, duplicate-submit prevention,
copy success and clipboard denial. A generated draft is not exposed for posting
until answer persistence succeeds. Missing/invalid generated text is an error,
not an empty successful response or a substitute draft. These deterministic
tests verify state and API contracts, not the quality of live LLM prose.

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

### Google inquiry / meeting / enrollment acceptance

`src/lib/google-lead-persistence.test.ts` connects the actual Google results
GET/POST/PATCH/DELETE handlers, access checks, store and aggregation to the exact
GoogleLead migrations in a fresh in-memory PGlite database per case. Only session
identity and the Prisma transport are replaced. The test adapter translates the
supplied filters, projection, sort and limit to parameterized SQL; it does not add
school/version/deletion predicates missing from application arguments. Timestamp
parsing explicitly uses UTC to match Prisma's timestamp boundary on both JST and
UTC hosts. The generated IDs and updatedAt values are test transport substitutes.

Coverage includes inquiry -> meeting -> repeated fresh GET, concurrent identical
submissions, conflicting/reused keys, soft deletion, school permissions and
cross-school IDs, body school/source spoofing, two stale version writers, a
committed insert followed by transport failure, unavailable reads, a real SQL
constraint rejecting an update, JST month boundaries, current-status meeting
semantics, and an old inquiry converted outside the inquiry trend window.

This closes a route/store/SQL integration gap, not live production acceptance.
It does not use a real Prisma engine, Supabase connection/session, production RLS
roles, durable process restart, or customer data. Browser reload remains covered
with synthetic API responses in `e2e/google-results.spec.ts`. Automatic Google
attribution is outside this manual flow.

The subsequently authorized lifecycle extension covers explicit scheduled, held
and enrolled transitions, stale-version rejection, mixed legacy/new requests,
chronology, legacy unknown meetings, correction and event/cohort aggregation.
`google-lead-lifecycle.test.ts` applies the exact additive migration and verifies
unchanged legacy fields, old SQL compatibility and chronology constraints.
`google-lead-auth.test.ts` exercises the real access resolver against a mocked
Supabase boundary: only stored active profiles and assigned schools authorize
requests; editable metadata cannot elevate a manager and requests do not accept
invitations. `google-lead-acceptance.test.ts` verifies the proposed fixture SQL
preserves unrelated data and refuses conflicting identities/excess records.

Desktop and mobile E2E operate inquiry -> scheduled -> held -> enrolled, reload,
saved-write/read-failure recovery, school changes, touch controls and help focus.
The 320px control hit tests and screenshots supplement the normal mobile view.
Local and release-main verification: 1,949 tests and 32 browser cases passed on
2026-10-09. The subsequently approved live release and limited Supabase/Prisma
persistence acceptance are recorded in `google-lead-production-acceptance.md`.
Fresh OAuth on the canonical domain remains unverified; the real UI acceptance
used the existing administrator session on the same deployment's Vercel alias.
Fixture SQL now reuses the unchanged loginless system-user, verifies the owner's
expected identity, and uses unique CODEX_TEST place markers. The fixture schema
models School.googlePlaceId's real NOT NULL/UNIQUE boundary, so the formerly
colliding empty-place setup cannot incorrectly pass again.
