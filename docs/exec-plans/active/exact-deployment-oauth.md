# Exact deployment OAuth verification mode

Base: a5790af0dd288d409cacfcade5470b1ddb91ddcd, tree
124399655a7eb5588badf9911c4d5fccc066eced, exact CI 38231164988 passed.
Stable 25f39b1 + PR15 + PR16 and review metadata only; no PR12/Instagram changes.

Objective: temporarily permit only the running deployment's exact HTTPS origin
for Google app login, using a default-off server flag and trusted VERCEL_URL.
Keep canonical/legacy/local behavior, scopes, callback processing, sessions and
server API authorization unchanged. No DB/dependency changes.

Inspected login/page.tsx, supabase-auth.ts and tests, callback, logout, verifier,
E2E fixtures and architecture. Login passes window.location.origin. Unknown origins
currently fail before SDK OAuth. Introduce a same-origin POST policy endpoint only
for unknown browser origins. Server compares Origin exactly with validated
https://${VERCEL_URL} only when AUTH_ALLOW_EXACT_VERCEL_DEPLOYMENT_ORIGIN=true.
It ignores query/body/Host/forwarded headers. Client requires exact matching response
before SDK invocation; no provider call on denial/network/malformed response.
No NEXT_PUBLIC variable, dynamic origin list, CORS allowance or secret response.
This public policy endpoint confers no application/session/data authorization.

Vercel read-only: System Environment Variables enabled, Standard Protection enabled.
Prior blanket incompatibility conclusion corrected: existing exact staged URL
school-os-pb2zrlw5i-invincible20252dice-2177s-projects.vercel.app serves /login and
bare /auth/callback missing-token UI in existing normal Chrome without challenge.
Staged dpl_d8UshKKxDw1ugJWn2ePjHDKKByCd is 7e50d90457bfd418c3157724905f3b018f148f21.
This proves app reachability only, not real OAuth or callback registration.

- [x] TDD server/client denial and exact-origin positive cases
- [x] Full codex:verify, desktop + mobile viewport E2E
- [x] Feature draft PR17 created against the fixed candidate branch
- [ ] Exact final Actions completion (in progress at this checkpoint)
- [ ] Independent parent review (stop before deployment)
- [ ] Separately gated no-alias build and exact temporary callback
- [ ] Real OAuth acceptance and callback cleanup

Proposed activation after CI/review only: deployment-specific CLI runtime --env
AUTH_ALLOW_EXACT_VERCEL_DEPLOYMENT_ORIGIN=true. No shared env or protection edits.
No CLI acquisition/deploy in implementation phase. No alias/promote/main merge.
Actual new candidate must pass reachability before user Google consent. Keep PKCE
in the same browser/origin and avoid intermediate redirects losing implicit fragment.
Supabase callback addition/removal needs exact URL and parent's action-time gate.
Physical mobile is distinct from Chromium mobile viewport emulation. Stable's known
logout defect must be reported as existing, not a new candidate regression.

Implementation commit: 6a5cd9d1c1bfcc0bf08e5af6b20b4f53db57d383; tree
aedc589a8195e51fa9f16e095d340660a7e4721d. PR17:
https://github.com/invincible20252dice/school-os-meo/pull/17
Only this checkpoint documentation changes after that tested code. Final SHA/tree
and exact CI checkout are recorded in PR17 and the handoff evidence once complete.

Local validation: TDD positive case failed before implementation; route suite could
not load the absent route. Then 77 targeted cases passed. Full codex:verify passed:
172 files / 2,108 unit/integration cases, 62 E2E, typecheck, lint, tooling, migration
safety, Prisma generation and plain build. No coverage relaxation; new policy route
100% coverage, total lines 99.25%, branches 97.53%. Six pre-existing lint warnings.
Initial aggregate failures were sandbox localhost listen EPERM, then missing browser
cache path (62 launch failures); authorized local run with existing
PLAYWRIGHT_BROWSERS_PATH=/tmp/school-os-playwright passed. No new install required.

Desktop/mobile E2E forwards virtual HTTPS app requests into the real isolated Next
policy route with synthetic server metadata. Exact host passes; a different Vercel
host and network failure reject. Existing 56 E2E are retained. Mobile means Chromium
iPhone13 emulation on a desktop runner, not physical iOS/Safari. No live OAuth,
production session revocation, candidate deployment or canonical acceptance proved.
Next: verify final Actions, independent review, then separately gated candidate-only
deployment/runtime flag and exact temporary callback. Keep this plan active until
real acceptance and callback cleanup; no production rollout implied.
