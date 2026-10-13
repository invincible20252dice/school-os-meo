# Auth-only callback origin repair

**Paused (2026-10-13):** PR #18 production acceptance was observation-insufficient,
not a confirmed authentication failure. Production aliases were restored to
stable `25f39b1`. [Main/stable alignment](main-stable-alignment.md) removes this
unjudged implementation from the release path. The history below does not
authorize another OAuth run, merge, deployment or alias change.

Current release integration and authority: [auth-production-release.md](auth-production-release.md). The following records the original isolated PR work; its earlier deployment restrictions/status do not supersede the approved release plan.

Base production 25f39b138684dd67c652d7fba345fb6c9cc5c29f, not main (which includes
failed Instagram PR12). Separate codex/auth-stable-base contains only disabled
preview flags and matching tooling expectation; PR targets it, never main.
No revert, merge, deployment, alias, Site URL, env, secret, scope or DB change.

Reference audit: getAuthCallbackUrl is called by requestMagicLinkEmail and
startGoogleOAuth; only app/login/page.tsx calls startGoogleOAuth in application code,
passing window.location.origin. Magic-link helper has no current app caller.
Shared public base variables also configure GBP/Instagram OAuth and LINE/review
links; those helpers remain unchanged. Auth callback uses relative navigation.

Minimal repair: Google app OAuth only prefers a supplied exact approved origin:
https://app.jukumeo.com, https://school-os-meo.vercel.app, http://localhost:3030 or
http://localhost:3031. Exact matching rejects paths, credentials, queries, ports,
lookalikes and unknown origins rather than falling back on malformed input. If
caller omits browser origin, only an approved configured base may be used.
No Host/forwarded header, URL query or arbitrary caller origin becomes trusted.

- [x] TDD stale legacy base vs canonical, retained legacy/localhost, rejection: 19 failed / 18 passed before repair, all 37 passed after.
- [x] Unit + isolated browser flow tests without real OAuth; full codex:verify passed, 52 desktop/mobile E2E (40.2s), typecheck/lint/coverage/plain build. Browser origin virtualization serves assets from loopback only; unapproved loopback origin is denied before OAuth. Production callback/session success is not claimed.
- [ ] Preview-disabled feature/base push, draft PR against stable base, exact CI.

Release proposal (requires separate approval): review auth-only diff vs 25f39b1,
verify candidate SHA, build explicitly from that SHA with existing configuration,
confirm served callback selection, then approved staged deployment and user login
acceptance with rollback to stable deployment. Do not merge/deploy current main.
Alternative main revert requires separately authorized revert/review/CI and is not
performed here. Keep Instagram integration 209667e unchanged. Production auth
acceptance remains blocked until an approved auth-only deployment; synthetic tests
do not establish actual OAuth callback/session success.
