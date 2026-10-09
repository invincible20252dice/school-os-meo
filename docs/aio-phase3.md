# AIO Phase 3: evidence boundaries

## Implemented

The school-scoped AIO GET reuses TargetKeyword, RankHistory.competitorData and
SchoolChallenge.document. No schema, production rows or accepted OpenAI results
are changed. Viewing comparisons/history never calls OpenAI or Google.

- At most three recommended candidates per keyword and five per school.
- Full branch names, region and any answer address must agree. Conflicting or
  ambiguous observations remain unresolved; no fuzzy-name-only automatic match.
- Own school requires its saved place ID and full address, not a name guess.
- Per-metric medians exclude missing values and include genuine zero values.
- At most three school-wide actions reuse existing action keys, guides, DAY links
  and execution history exclusions. Recently completed (seven days), ongoing,
  waiting and deferred actions are excluded. Malformed history suspends advice.
- Google facts and answer-only suggestions are labelled separately. Neither is
  described as the cause of an OpenAI recommendation or a guaranteed outcome.
- Old answer text/citations are fetched on demand with the existing authorization
  and schoolId boundary. History reads cannot trigger paid remeasurement.

## Google ingestion is not implemented

The inspected ranking/competitor implementation has simulated data, not a live
Google competitor collector. AIO does not use the rankings API's simulation path.
No existing row is relabelled as verified Google data. Therefore production may
correctly show `比較データ未取得` while answer-only suggestions remain available.
Fixture comparisons prove the matching and presentation, not live acquisition.

`readPlaceSnapshots` defines a **read contract**, not a new producer:
RankHistory.competitorData must carry source (`google-places` or
`google-business-profile`), retentionUntil and places. Each place needs placeId,
name and address. Only unexpired observations under seven days old are eligible.
Each count must be a valid non-negative integer. Rating/percentages are bounded.
Mock IDs, old plain arrays, unsourced, stale and malformed observations are ignored.

Google Places partial photos/reviews must not be presented as totals or reliable
latest dates. Photo totals, reply rate, latest review/post and complete services
require a managed GBP observation with the corresponding explicit completeness
flag. Competitor GBP metrics generally cannot be obtained without management
authorization; missing data remains missing. A website link does not prove a
working inquiry funnel, and a missing service label does not prove non-provision.

Before adding a real ingestion adapter, establish the authorized provider,
available fields, credentials, permitted storage/attribution, retention/deletion
policy and cost cap. The seven-day consumer ceiling does NOT grant caching rights.
Google Places generally restricts stored content; place IDs are an exception:
https://developers.google.com/maps/documentation/places/web-service/policies

No scraping, new credentials, paid Google calls, or persistent imports were added.
Source expiry is checked on each API read; no automatic refresh or Cron is enabled.

## Verification and release

Unit tests cover identity, boundaries, unknown/zero, caps, medians, complete vs
partial metrics, execution-history privacy and action exclusions. PGlite tests
preserve measurement history and reject cross-school history detail reads. Browser
fixtures cover four results, reload, history, matching, action deduplication and
PC/mobile layout while blocking all external traffic. See the active ExecPlan for
actual verification results; these are distinct from a live Google acceptance run.

No migration is needed. Release only the reviewed commit after CI and production
authorization under AGENTS.md; roll back code to the previous deployment if needed.
There is no data rollback. Keep Gemini, AI Overview and Cron disabled. Do not
repeat the accepted four paid OpenAI measurements to test this read-only feature.
