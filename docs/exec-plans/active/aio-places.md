# AIO Places: ID-only persistence

## Approved boundary

Google Places (New) content is transient. Persist only Place IDs, a hash of the
OpenAI/user-owned candidate identity, and operational request metadata. Never
persist Google names, addresses, ratings, counts, photos, URLs, or derived numeric
facts/actions. No automatic page-open provider requests. No OpenAI calls.

## Design / files

- Add `aio-places-provider` for fixed-host Text Search + Details, minimal masks,
  attribution, typed safe errors, no retries and request-local deduplication.
- Add `aio-places` orchestration and an authenticated admin/school-scoped route.
  Reuse existing candidate extraction, matching, comparisons and action guides.
- Add AioPlaceLink and AioPlacesRequest (new tables only) with school foreign
  keys, unique request IDs, indexes, CHECK constraints, RLS and no client access.
  Reservations under a short school advisory lock bound calls across instances.
  Never write Places metadata into RankHistory, AioMeasurement or challenges.
- Add explicit refresh UI; volatile values clear on failure/reload/expiry.
  Google Maps attribution stays next to provider content; School OS judgments are
  separate. Photo presence is not a total count; no unsupported posting metrics.
- Extend unit/route/SQL/component and PC/mobile E2E; run codex:verify and Linux CI.

## Cost / safety

Pilot defaults to one competitor, maximum five after separately verified pilot.
At most two requests per competitor, plus one Details request for the school's
known ID. Reserve the maximum before any HTTP call; daily cap 11 reserved calls,
10-minute cooldown, same request ID never re-executes even after interruption.
Google content never enters logs, local/session storage or durable tables.
Place IDs older than 12 months are re-resolved on explicit refresh, not by Cron.
Details ratings/counts/website use Enterprise SKU; no Atmosphere fields, `*`,
pagination, photo media or retries. Production billing/API enablement, credentials,
schema and deploy remain approval gates. No production operations in CI.

## Acceptance / progress

- [x] Read repository rules, current comparison/authorization and official policy.
- [x] User approved Place-ID-only storage.
- [x] Provider and persistence tests, implementation, UI and isolated E2E definitions.
- [ ] codex:verify and Linux CI; review desktop/mobile screenshots.
- [ ] Live one-competitor acceptance (blocked on key/API/schema/deploy readiness).

## External checks

Vercel production env names are readable: no Places/Maps key is registered.
GOOGLE_CLIENT_ID/SECRET are OAuth credentials, not Places API keys. No values
were pulled. Google Cloud currently shows My First Project; its relationship to
School OS is not verified, so its API list is not evidence about School OS.

Policy: https://developers.google.com/maps/documentation/places/web-service/policies
Fields: https://developers.google.com/maps/documentation/places/web-service/place-details

Rollback: leave additive tables/data intact, disable the Places feature or revert
application commit. No DROP, reset, data deletion, or migration history rewriting.

## Local verification

codex:verify passed preflight, SQL static safety, tooling, Prisma generate,
typecheck, lint (six pre-existing warnings), 1,979 tests and plain build.
New SQL was applied only to isolated in-memory PGlite; existing fixture rows,
RLS/privilege denial, FK/check/duplicate-request constraints passed. A route-test
literal type was corrected after the first typecheck failure.
Local Playwright could not start: Chromium headless-shell 1208 executable absent.
This is not an E2E pass. Linux CI and screenshot review remain pending.
