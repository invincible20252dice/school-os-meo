# Monthly Google search keyword diagnosis (2026-10-05 JST)

## Verified production findings

1. School: `cms5tnzlr0001jt04qh0lluva` (iスクール予備校).
2. Selected location: `locations/6467241578381534467`; the Performance resource uses `locations/{id}`, not an account-prefixed path.
3. OAuth refresh returned HTTP 200. Granted scopes include `https://www.googleapis.com/auth/business.manage`, email/profile and openid. Tokens were not logged.
4. The requested completed month was September 2026. Both `monthlyRange.startMonth` and `monthlyRange.endMonth` use year 2026/month 9, inclusive. Page size is 100.
5. The monthly keyword endpoint returned HTTP 429.
6. Google response: `RESOURCE_EXHAUSTED`, Requests / Requests per minute quota exceeded for `businessprofileperformance.googleapis.com`, consumer project `1035939854926`. A separate read-only Business Information location request also returned 429; its ErrorInfo reports `RATE_LIMIT_EXCEEDED`, `quota_limit_value: "0"`, unit `1/min/{project}`.
7. Before this change there was no monthly keyword API request/parser. The challenge read only legacy SearchQueryLog rows. The new parser validates all pages, distinguishes exact values from suppressed-count thresholds, and rejects malformed responses rather than inventing zeroes. A successful empty Google response is EMPTY, not API_ERROR. Live successful response conversion remains unverified because Google rejects the request; protocol tests cover it.
8. The immediate UI error was a separate DB mismatch: production SearchQueryLog had no updatedAt column. It also had category rather than the Prisma intent field. Added nullable updatedAt/intent columns without fabricating historical timestamps or changing existing columns/rows. New verified monthly data and attempt diagnostics are isolated in GoogleSearchKeywordMonth, uniquely scoped by school/location/month. The actual failed API attempt was successfully saved as API_ERROR; no successful keyword counts were fabricated.

OAuth is working. The failure is NOT limited to search keywords: two distinct GBP APIs reject requests due to project quota. This does not prove that every other Google product/API is broken. The independent InstagramSetting missing-column error seen in the same logs is outside this change.

## Implementation

- `google-search-keywords.ts`: monthly request, pagination, response validation, scoped credential pairs, one-hour persisted retry suppression, safe diagnostics and storage.
- `POST /api/dashboard/analytics/queries/sync`: authenticated approved school access; only completed YYYY-MM periods accepted; no access to another school's data.
- Challenge demand now uses verified monthly data and independent status, without reclassifying a keyword failure as a global Google disconnection.
- `AVAILABLE`, `EMPTY`, `DISCONNECTED`, `API_ERROR`, `DB_ERROR` are distinct. API failure never overwrites prior successful rows/fetchedAt. Stale rows are not displayed as newly fetched results.
- Threshold-only terms remain in storage/API with impressions=null; they are not ranked as exact impression counts. The API does not supply clicks/CTR, so this ingestion does not invent them.
- Original SearchQueryLog rows are retained. The existing historical analytics screen remains a separate consumer; this work does not overwrite its legacy records with monthly GBP estimates.
- Additive migration: `20261005070000_search_keyword_sync`; new table has RLS enabled. No reset, delete, truncate or destructive migration.

## Remaining external requirement

Google Cloud project `1035939854926` needs GBP API access/appropriate nonzero quota. A zero quota indicates access has not been granted according to Google's documentation. Re-authenticating OAuth or repeatedly retrying cannot resolve project approval. After Google resolves the quota, the next uncached request will retrieve the completed month's data. Successful zero results, if returned, will remain EMPTY.

Sources:
- https://developers.google.com/my-business/reference/performance/rest/v1/locations.searchkeywords.impressions.monthly/list
- https://developers.google.com/my-business/content/limits

## Verification

Protocol and persistence tests cover 403/429/500, revoked OAuth, missing scope/configuration, malformed/duplicate/paginated data, exact zero, thresholds, cache behavior, preserved successful rows on failure, database errors and school isolation. PGlite verifies repeatable additive migration, unchanged historical data, unique school/location/month keys, foreign keys and RLS.

The release script is explicit and not part of normal builds. It applies only this migration and logs redacted diagnostics for an explicitly supplied school. Normal vercel.json remains `npm run build`.
