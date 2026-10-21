# Main alignment with the accepted stable deployment

## Objective and authority

Keep the PR #12 exclusion from PR #18, while removing only the canonical-login
and local-logout implementation whose production acceptance remains **observation
insufficient / unjudged**. This is source alignment, not a diagnosis or resolution
of an authentication defect. Never revert PR #18 as a whole: that would restore
PR #12. OAuth verification stays stopped.

The user authorized a feature branch, draft PR, isolated full verification, CI
and independent review. Stop before main merge, deployment or alias changes.
No DB, migration, env, secret, authentication setting, main reset or force push.
PR #19 stays a separate draft and contributes no files to this change.

## Baselines and inspected sources

- Fetched main: `b9867de5a10507da1bcd5014173198bb0e028f3e`, tree
  `175fc8eeb255ba825226f049c1eb2fa0e617c8e6`.
- Stable production: `dpl_48Erde1hQPKvorWUmgciC7CY9ZH1`, commit
  `25f39b138684dd67c652d7fba345fb6c9cc5c29f`.
- PR #18 contains PR #12 exclusion commit `c9dc575`, then authentication
  integration `04a77f4`. The exclusion commit matches stable for all pre-existing
  tracked files; its only extra file is the release plan.
- Read AGENTS, product/development rules, architecture, testing, verification
  skill, and the three authentication ExecPlans. Main has no
  `docs/AUTONOMOUS_PM_POLICY.md`; the existing PR #19 version was read for
  operating guidance only and is deliberately not copied into this branch.

## Selected change and consumers

Restore the stable blobs of `src/lib/supabase-auth.ts`, dashboard layout,
`AuthApprovalGate.tsx`, and `DashboardHeader.tsx`; remove the PR #16-only
`src/lib/logout.ts`. Restore the matching stable auth tests, core E2E and fixture;
remove only the newly introduced gate/logout unit suites and logout E2E.
The complete `src/` and `e2e/` trees must match stable, not merely selected lines.
All API routes, Instagram manual/preview/cron code, Prisma schema/migrations,
dependencies/lockfile and CI workflow remain byte-identical to stable.

Retain the release-branch preview-disable entry and add only this feature branch
to `vercel.json` deployment exclusions, with its exact tooling assertion.
Do not change Vercel project settings. Record read-only main auto-deploy and
production domain-assignment settings separately before any push.

## Risks and preserved boundaries

This intentionally preserves the behavior already deployed on stable: configured
callback-base preference, a logout link that navigates to `/login` without clearing
the session, and a client gate that does not withhold children on missing session.
These are known unresolved limitations; this PR does not claim to fix them.
Existing server API authorization and school isolation remain untouched.
The stable Instagram manual-authorization/cron fail-open and preview/schema gaps
also remain separate work; do not invoke those APIs or publish/sync provider data.

Removed tests are owned by the removed implementation, not failed stable tests:
the 20 added canonical-origin cases, 16 local-logout/gate cases, and their added
desktop/mobile E2E scenarios will be counted against the exact source. Preserve
every stable test and all 95% coverage gates. No skips or timeout increases.

## Checklist and acceptance

- [x] Re-fetch main; inspect origin, clean worktree and PR #18 decomposition.
- [x] Run preflight before edits; isolate `codex/main-stable-alignment` worktree.
- [x] Read-only Vercel audit: main Git builds versus domain publication; aliases.
- [x] Restore stable runtime/tests; record tree/blob equality and exact test delta.
- [x] Full `PLAYWRIGHT_BROWSERS_PATH=/tmp/school-os-playwright npm run codex:verify`.
- [x] Review desktop/mobile screenshots; no real provider/DB/OAuth operations.
- [x] Draft PR, push/PR CI with actual checkout SHA and tree identity.
- [x] Independent review and final diff against main and stable.
- [x] Stop before merge/deploy; document residual risks and rollback procedure.

## Release boundary and rollback

Until this PR is merged, existing main still contains the unjudged authentication
changes. A future unrelated main update cannot be certified safe by this unmerged
PR. After approval, merge only the reviewed final tree and recheck exact main CI
and hosting settings before any production action. A future PR #19 merge must be
rebased/reviewed against this alignment; it is not approved for release here.

No production operation occurs in this task. If a later separately approved
release needs restoration, verify the stable deployment above and restore only
the approved aliases to it. Do not reset or force-push main. Reintroducing the
isolated authentication changes requires a separate reviewed PR and acceptance.

## Validation and current status

At 2026-10-13 18:09 JST, read-only Vercel metadata showed
`gitProviderOptions.createDeployments=enabled`, production branch `main`, and
`autoAssignCustomDomains=false`. Both public aliases still resolved to the
stable deployment and SHA, READY. Main has no `deploymentEnabled:false` rule;
a main push/merge may create a Production build/deployment even though automatic
domain publication is disabled. This PR changes no project setting. Its exact
feature-branch exclusion is included before first push. GitHub Quality only runs
isolated verification and has no deploy step. Manual deploys or independent
external automation are not blocked by this versioned branch rule.

Before verification, `git diff 25f39b1 -- src e2e prisma package.json
package-lock.json .github/workflows vitest.config.ts playwright.config.ts` was
empty. Canonical-origin cases account for 20 unit removals, gate/logout for 16;
stable's 17 auth cases remain intact. E2E restores the original one OAuth test
instead of five canonical-origin tests, and removes two logout-only tests:
six fewer scenarios per viewport (12 fewer executions total). This is withdrawal
of feature-owned tests together with their implementation; no stable test,
coverage gate, failure assertion, timeout or skip policy is weakened.

React review: stable imports, Suspense boundaries, effect cleanup and accessible
navigation labels are restored together. The known link-only logout and missing
session client-gate limitations above are deliberate baseline equivalence, not
new behavior claimed to be secure by this alignment.

Local full verification passed on the first run: tooling 9/9, migration safety,
Prisma generation, typecheck, lint, 168 unit/integration files / 2,032 cases,
plain build and 44 E2E (desktop 22 + mobile viewport 22). Main previously had
2,068 unit/integration and 56 E2E: the exact reductions are the feature-owned
36 and 12 cases described above. Coverage: lines/statements 99.25%, functions
99.77%, branches 97.53%; all existing 95% thresholds unchanged. Generated
`next-env.d.ts` restored cleanly by the verification script. Desktop/mobile
Google-settings screenshots were visually checked; existing layout and
accessible navigation remain visible. Real Google/Supabase OAuth, live DB and
physical mobile-device checks are NOT RUN and remain stopped.

Dependency installation used the unchanged lockfile with `npm ci --ignore-scripts`.
Its audit reported 19 pre-existing dependency advisories; no dependency upgrade or
audit fix was attempted in this baseline-only change.

## Completed development verification

Draft [PR #20](https://github.com/invincible20252dice/school-os-meo/pull/20)
contains the implementation commit `51ada584eb55fce37829977e925c86771b9e9126`,
tree `ae57de48860ad3cd730b22622fd5f1996127a36a`. Both initial CI jobs passed:

- Push run `38375242697`, job `115222433245`: actual checkout `51ada584eb55fce37829977e925c86771b9e9126`.
- PR run `38375586463`, job `115223006880`: actual checkout `6d55cef1694d0cf8d19c58ec67b10deb4d0c1ede`.
- PR test-merge tree is `ae57de48860ad3cd730b22622fd5f1996127a36a`, equal to HEAD.
- Both job logs confirm 2,032 unit/integration cases, 44 desktop/mobile E2E,
  typecheck, lint, coverage and build passed. No failed tests were skipped or weakened.
- Independent review of the exact implementation commit found no actionable new
  defects; source/test tree equality, test withdrawal scope, project boundaries
  and documentation links were checked independently.

At 18:23 JST, a read-only Vercel history check returned zero deployments for
both this branch and the exact implementation SHA (no next page). Both public
aliases remained on stable/READY. This is a point-in-time verification, not a
guarantee against future manual actions or external automation.

The management-only follow-up moves this plan to completed and updates its
three inbound links. It changes no runtime, test, build, workflow or hosting
configuration. Its exact final HEAD and subsequent push/PR CI are recorded in
the PR description/checks and local verification evidence, avoiding a self-referential
commit ID in this file. Check the final PR HEAD before any later approval.

Development is complete; the PR remains draft and unmerged. No production or
OAuth operation was performed. Next: parent review of the final SHA/tree and a
separate decision about merge, which can trigger a Production build. Retain the
stable aliases until a concrete separately authorized release step.
