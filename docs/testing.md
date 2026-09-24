# Testing and coverage

Run `npm run test:ci` before deployment. This runs coverage checks followed by
Prisma Client generation and the Next.js production build.

## Measured scope

`vitest.config.ts` measures the existing shared TypeScript libraries, API routes,
dashboard navigation, and the reviews client component. It does not measure all
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

## External verification boundary

These tests do not publish replies to real Google reviews, verify current OAuth
credentials, or prove Google API approval/quota availability. A successful build
and coverage report are not evidence of a successful production Google write.
Production posting must be verified with an authorized account and an intended
reply. Never replace a failed Google request with a fabricated success response.
