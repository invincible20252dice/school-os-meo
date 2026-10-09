# OpenAI AIO Phase 2

## Rollout boundary

Phase 1 production acceptance (2026-10-09): one OpenAI search answer for
iスクール予備校 / 熊本 予備校 おすすめ was saved and survived authenticated reload.
It was a genuine successful 0%, not missing measurement. This record is unchanged.
Phase 2 is verification-branch-only until explicit production deployment approval.
No schema migration, production measurement, main merge or deployment is performed
by this implementation task. Gemini, Google AI Overview and Cron remain disabled.

## Storage and semantics

- Existing AioMeasurement, provider `openai-web-search`, source `openai-search-v1`.
  The allowlist excludes old AioScoreHistory/sample rows. Search prompt text is
  saved on each attempt; Phase 2 uses natural Japanese plus saved city/prefecture/
  station. The target school name/street address is omitted from retrieval to
  avoid bias; lack of a location is not replaced with invented data.
- All active DB keywords are listed. Only the already approved pilot school can
  initiate paid measurements, and only its authenticated approved administrators.
  Managers retain authorized read access; the transaction validates keyword scope.
- One keyword per POST. Browser batches execute sequentially, GET after each POST.
  A stored provider failure permits the next keyword; uncertain transport/storage,
  busy reservation or daily budget stops the batch without automatic paid retries.
- Unique school/requestId plus school transaction advisory lock. A new request ID
  within 10 minutes of the latest same-keyword attempt reuses that record. Later
  requests append new attempts; old records are never rewritten or deleted.
  A RUNNING reservation blocks other keywords for five minutes. API timeout is
  35 seconds/request, at most two calls inside a 90-second route. Maximum five
  non-configuration attempts per school per rolling 24 hours is unchanged.
- Each current keyword contributes only its latest attempt. Successful recommended
  keywords / successful keywords, rounded to a whole percent. Failed, interrupted,
  missing and config-required records never contribute a successful zero.
- Up to latest 50 attempts/keyword, chronological Japan-day snapshots. Missing
  dates are not invented; days without a successful current attempt have null rates.
  Truncation is disclosed. Current active keywords define the series, so changing
  the active keyword set changes the displayed denominator. Raw historical answers
  remain in DB; history responses omit bodies to keep API payloads bounded.

## Evidence and actions

Conservative deterministic extraction uses explicitly recommended headings/lists,
cram/prep-school name markers, education context and verbatim evidence. This is not
complete entity recognition and may omit valid candidates. Reject own school,
negative recommendations, universities, schools, stations, search/admin/websites.
No extra provider requests are spent to manufacture comparisons.

The latest saved RankHistory competitor snapshot is reused through the existing
normalizer. Exact normalized names only; ambiguous matches stay unknown. Ratings
and review-count gaps require both own and competitor values in the same snapshot.
Do not substitute locally stored review-row counts for the total Google reviews.
Uncollected photos/posts/services are unknown, not missing services. Answer quotes
and saved observations never prove why the model recommended a school.

At most three existing NextAction/guide keys per successful negative keyword:
Google connection, neutral review-request flow when an observed count gap exists,
self-study photo example when quoted, description, post or competitor verification.
Use existing ActionExecutionGuide and challenge day links with schoolId. This does
not auto-create completed challenges, publish posts, or send review requests.
Recommended keywords have no forced actions; all recommended shows no action needed.

## Usage / planning cost

New `citations` JSON is `{version:2,sources:[...],usage:{...}}`; legacy arrays stay
readable. No ALTER or backfill is needed. Request attempts, completed responses,
reported input/cached/output tokens and completed search calls are saved, including
partial failure metadata. Unavailable usage is marked incomplete, never fabricated.
Maximum four searches plus four optional classifiers for four keyword measurements.
No classifier call if the exact school name is absent. No automatic API retry.

Pricing basis checked 2026-10-09: gpt-4.1-mini input $0.40/M, cached $0.10/M,
output $1.60/M; web search $0.01/call, fixed 8k search-content input tokens/call.
The displayed planning range avoids/permits adding that fixed block to returned
usage, because invoice inclusion is not established by this adapter. It is not a
billing statement, currency conversion or guaranteed cap. Missing usage/failed
transport yields unknown cost. Verify actual billing in the provider console.
Sources: [model](https://developers.openai.com/api/docs/models/gpt-4.1-mini),
[pricing](https://developers.openai.com/api/docs/pricing),
[web search](https://developers.openai.com/api/docs/guides/tools-web-search).

## Production after approval

1. Require green Linux Codex Verify on the exact commit. No SQL needed.
2. Merge reviewed branch via PR, deploy existing Vercel project without env pulls.
3. Authenticated admin verifies active keywords and existing attempts first.
4. Run the dynamic OpenAI batch once, within five-attempt daily allowance.
5. Check actual request/response, latest rows and all statuses. Reload, compare
   timestamps/IDs and numerator/denominator; inspect history, citations and actions.
6. Stop on uncertain writes; do not repeat automatically. Preserve all attempts.

Rollback is application-only: redeploy the previous reviewed application commit.
Do not delete new measurements or change schema. Versioned citation envelopes are
not understood by the old Phase 1 UI, so rolling back the AIO UI needs its compatible
metadata decoder retained (or temporarily close the AIO page). Restoring an old
app must not silently relabel newly measured data as old pilot data.
