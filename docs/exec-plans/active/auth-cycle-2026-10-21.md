# Auth acceptance preparation — 2026-10-21

Owner: native Codex lane B (/root/lane_b_auth). PR23 remains stacked on PR22.
Baseline PR22 ed020d381fade4cc25c26d96806f9c4d978e3877;
PR23 aabbf33726068e7cc983a3d8c7d2b3d7cd52e725. Both Draft, clean and mergeable
at the initial GitHub read. No implementation duplication or PR22 changes.

## Evidence and narrow addition

Inspected supabase-auth, logout-operation, AuthApprovalGate, callback client,
their unit tests, real-SDK logout tests and desktop/mobile browser fixtures.
Existing PR23 origin tests prove rejection before a mocked SDK call; existing
browser cases prove rejected UI/navigation but do not seed a virtual-origin session.
Add a real installed SDK integration test for lookalike and nonstandard-port origins:
seed via synthetic password endpoint, reject twice, preserve persisted session,
restore that same session with a fresh client, and make no further auth requests.
This is preparation for staging acceptance, not real OAuth or live session evidence.

PR22 existing tests cover local scope, SDK storage deletion, reload/direct protected
URL/history rejection, re-login, duplicate logout, HTTP503 recovery retention,
explicit retry and late PR21 inquiry responses without automatic replay.
PR23 inherits these cases. No server authorization, profile/role, callback, SQL,
provider settings, secret, deployment configuration or shared fixtures are changed.

## Validation and remaining acceptance gates

- Mutation check must fail if rejected login clears the existing SDK session.
  Restore the production source exactly before normal verification.
- Run focused SDK/origin/logout tests, then the unchanged full codex:verify pipeline
  including desktop/mobile E2E; serialize port4317 with lane A.
- Review final SHA independently; check unchanged exact branch deployment false,
  remote baseline and clean diff before normal push to the existing PR23 branch.
- Record exact final SHA, logs and CI externally under cycle-2026-10-21/lane-b.
- Staging gate: explicit candidate/environment approval, exact artifact SHA, approved
  redirect registration and alias observation, synthetic test account authorization,
  real OAuth callback/session reload, local logout then protected URL rejection,
  PR21 recovery consistency. Do not infer live success from local synthetic cases.
  No staging assignment, deployment, provider settings or real OAuth in this cycle.

This active plan remains pending the separate live acceptance gates. Local and
remote validation outcomes are recorded externally to keep final-SHA evidence fixed.
