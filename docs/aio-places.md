# Places API (New): transient comparison

## Storage contract

Only Place IDs from Google are persisted. `AioPlaceLink` stores schoolId, a SHA256
of the OpenAI candidate and search context, placeId, identifiedAt. No Google
rating/count/address/name/category/photo/URL/raw JSON columns exist.
`AioPlacesRequest` stores only request identity, reserved/actual call counts,
safe error code, status and timestamps. It is a billing/dedup ledger, not Google
content history. Do not add content to either table, RankHistory, AioMeasurement,
challenge documents, browser storage, analytics or logs.

Explicit admin refresh selects server-derived active keyword candidates, three
per keyword and five unique competitors per school. Text Search (New) resolves a
name + prefecture/city; full branch name and region must agree uniquely. LOW or
ambiguous results are never persisted. Cached IDs skip search, but Details still
revalidates identity; after 12 months explicit refresh searches again. There is
no background refresh, retry or page-open provider call. No OpenAI call.

The Details response is used only in the request/current UI. It is no-store,
never persisted, and is cleared on refresh failure, reload, scope change or after
five minutes. Reload preserves the existing OpenAI results, NOT Google content.
Google content history/charts are deliberately absent. Median/action facts are
computed in memory and labeled separately as School OS judgments. Photos report
presence only, never a total. Posting/reply frequency cannot be inferred.

## Configuration and cost

- Server-only `GOOGLE_PLACES_API_KEY`, restricted to Places API (New). Do not
  reuse GOOGLE_CLIENT_ID/SECRET: these are OAuth credentials, not Maps API keys.
- Existing DATABASE_URL stays in the Vercel runtime. No secret pulls required.
- AIO_PLACES_MAX_COMPETITORS defaults to 1; only the exact value `5` expands the
  cap. Set it only after a live one-competitor acceptance and cost approval.
- Initial worst case: competitor search + competitor details + own details = 3
  HTTP requests. Five-competitor worst case: 11. Saved IDs reduce actual calls.
- Per school: 10-minute cooldown and 11 **reserved** calls per rolling 24 hours.
  Reserve before HTTP, including crashes/failures; do not refund failed requests.
  Same requestId cannot execute twice, across tabs or instances. DB unavailable
  fails closed without Google calls. Provider client additionally caps at 11.
- Search mask: id/displayName/formattedAddress (Pro). Details rating/count and
  website use Enterprise billing. No `*`, reviews/Atmosphere, photo media, pages
  of search results or retry calls. Check current prices before enabling.
- API_DISABLED, BILLING_DISABLED, NOT_CONFIGURED, AUTH_FAILED, RATE_LIMIT, QUOTA,
  TIMEOUT, INVALID_RESPONSE, NO_MATCH, AMBIGUOUS and storage failures stay distinct.
  A generic 403 does not prove billing is missing; raw errors are never returned.

## Release gates (not executed by build/CI)

1. Confirm the School OS Google Cloud project, enablement, billing and restricted
   key. Vercel's inspected production env list has no Places/Maps key. Cloud's
   currently selected My First Project has not been verified as School OS.
2. Obtain approval and recheck production schema/counts; apply only
   `supabase/migrations/20261009091535_aio_places_ids_only.sql`. New two tables,
   indexes, CHECK/FK/RLS; no changes to existing rows/columns or migration history.
   No Prisma migrate deploy/reset/db push or Supabase db push.
3. Confirm publicly accessible School OS Terms/Privacy incorporating Google's
   required terms/privacy links. Existing repo has no verified public policy
   routes; product-owner policy review is still a release prerequisite.
4. After separate main merge/deploy approval, use the authorized pilot school's
   admin AIO screen, refresh one competitor once. Verify ID-only rows and counts,
   current values/attributions/matching/actions, then reload: Google values must
   disappear, OpenAI results must remain. Do not substitute mocks for this proof.
5. Only after pilot success expand to max five. Do not activate Cron/Gemini/AIO.

Rollback: disable new route/UI via application rollback; retain additive tables,
IDs and ledger. Never delete existing data to recover from a deployment issue.

Sources checked 2026-10-09:
- https://developers.google.com/maps/documentation/places/web-service/policies
- https://developers.google.com/maps/documentation/places/web-service/place-details
- https://developers.google.com/maps/documentation/places/web-service/text-search
- https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
