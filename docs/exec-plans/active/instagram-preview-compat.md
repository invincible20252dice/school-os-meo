# Instagram preview compatibility after #12 rollback

## Scope and current state
- Keep production at #11: 25f39b1 / dpl_48Erde1hQPKvorWUmgciC7CY9ZH1.
- Work on codex/instagram-preview-compat; disable its Vercel Git Preview before push.
- No merge, deployment, DB/schema/grant edits, secret/config changes, new OAuth grant,
  session extraction/transfer or external sync effects. Return PR and evidence to PM.
- Main includes #12 (67bcefc); all manual/preview authorization and cron fail-closed
  behavior must remain. Shared sync service is outside this small compatibility fix.

## Evidence and diagnosis
- 2026-10-12 06:29:50 UTC failed deployment dpl_8w1229MFhtRYwQzXnSLG8Met79tk:
  authenticated legacy-origin GET /api/instagram/preview returned 500. Vercel log:
  `InstagramSetting.lastSyncedAt` does not exist, followed by sanitized
  `Instagram preview lookup failed.` UI displayed `プレビューを取得できませんでした。`.
  The response JSON message is confirmed by source, not a captured network body.
- Anonymous canonical preview GET and manual POST separately returned 401.
- Read-only information_schema confirms missing lastSyncedAt and also the manual
  service's instagramAccessToken, instagramBusinessAccountId, autoSyncEnabled fields.
  Existing legacy names include accessToken/businessAccountId/status. Do not infer
  their equivalence or rewrite customer configuration.
- Supabase browser client uses installed supabase-js defaults: localStorage,
  persistSession=true, implicit flow. No auth cookies are configured; Cookie Domain,
  Secure/SameSite cannot share this storage between unrelated origins.
- Callback code prefers NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL to browser origin.
  Vercel confirms those keys exist for production/preview but their values are hidden
  as sensitive; no values were exposed. Supabase UI Site URL is the legacy origin;
  redirect allowlist has its callback/login/dashboard and localhost 3030/3031 callback,
  but no app.jukumeo.com callback. Both hosting aliases target stable #11 with no redirect.

## Minimal correction
Treat only Prisma P2022 for InstagramSetting.lastSyncedAt as an unavailable optional
timestamp. Return the authorized local sample plus an explicit timestamp-unavailable
state; never claim a real sync timestamp or use sample date as one. All other DB,
authentication, missing-table/column and permission failures remain errors. No DB
mutation, provider call, schema query, credential read or fallback to another school.

## Verification / release gates
- [x] Regression first: exact missing optional column succeeds with unavailable state;
  unrelated missing columns, permissions, network/auth errors fail closed.
- [x] UI displays unavailable state distinctly from no recorded sync and known timestamp.
- [x] Full codex:verify: 173 files / 2094 tests, typecheck/lint/plain build passed;
  coverage 99.26% lines/statements, 97.55% branches, 99.77% functions. 54 desktop/mobile
  E2E passed (42.2s); screenshots inspected. Red first: 1 failed / 28 passed. Focused
  green: 36 passed. Mocked DB/provider boundaries do not prove production success.
- [ ] Exact-head push and PR CI.
- [ ] Draft PR returned; production alias rechecked unchanged.
- [ ] Canonical live login: blocked on approved public URL/redirect configuration.
- [ ] Corrected canonical preview: cannot prove before publishing to that origin while
  keeping its stable alias unchanged. Local/mock checks are not live proof; protected
  deployment URL needs a separate legitimate login and is not canonical acceptance.
- [ ] Manual live success: blocked on schema compatibility and explicitly identified
  disposable school, Instagram/GBP test targets and approved writes/cost. No known
  dedicated targets have been verified; a zero-setting/no-op result is not real sync.

PM must resolve live gates before any publication. No speculative migration or
promotion. Cron, manual sync and preview retain separate credentials/acceptance.

## Additional inspection limits
- Vercel logs MCP returned 403; normal Chrome Logs UI supplied the matching deployed
  500 request and Prisma missing-column message. No repeated failing MCP call.
- Failed deployment's unique URL redirects an anonymous request to Vercel /sso-api
  (302). This is deployment protection, not the app's 401 or a corrected preview test.
  No protection bypass or cross-origin application token transfer was attempted.
- #12 main CI 38212567348 completed successfully at exact 67bcefc. It does not
  invalidate the live 500 or authorize re-publishing the rolled-back deployment.
- Cookies/session values were never inspected. Cookie Domain/Secure/SameSite are
  not used by this application's Supabase session implementation; third-party
  authentication cookies were outside inspection scope.
