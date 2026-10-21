# Offline verification receipt

`scripts/evidence-receipt.mjs` exports `assessReceipt(receipt)` for developer tools.
It performs no IO, does not read environment variables, and never authorizes an
operation. `EVIDENCE_COMPLETE` means the supplied fields are consistent; it does
not prove they are authentic, current or approved. Do not connect its result to
push, deployment, browser control, replies or other automatic actions.

Use sanitized JSON-shaped observations. Do not pass executable objects (getters,
proxies), provider payloads, cookies, tokens, secrets or customer records. The result
contains fixed reason codes only. The example builder in
`scripts/tests/evidence-receipt.test.mjs` documents the input structure.

## Required evidence

- `repo`, `branch`, full `head`, `base`, `tree` and `remoteHead`; Draft/unmerged state.
- `deploymentEnabled`: observed effective config for the exact project/root and
  candidate; exact branch false is required. `projectRootConfirmed` and
  `alternateConfig` describe independent inspection. Pattern keys are held for
  manual review rather than approximating Vercel matching semantics.
- `observationsComplete`, zero `deploymentCount`, independently selected
  `requiredAliases`, and complete `aliasesBefore`/`aliasesAfter` maps. Record both
  production aliases and the default alias. Maps contain alias-to-deployment IDs.
- `localVerify` identifies successful `head` and `tree` after full verification.
- `review` identifies `head`, independent reviewer status and zero unresolved findings.
- `ci` supplies the latest relevant attempts, event, head, actual checkout SHA,
  base, job `Codex Verify`, terminal status and conclusion. PR runs must include
  both synthetic merge parents. Obtain checkout/parents from actual Git evidence;
  an API head SHA alone does not establish which tree the PR workflow tested.

The caller must separately retain source URLs, observation timestamps, CI run IDs
and attempts, actual command/exit/logs, reviewer identity, paginated observation
completeness and the candidate tree. Verify those records before supplying booleans.
The function cannot establish any of them itself. Choose required aliases from the
known project inventory, never reduce the list to make an incomplete receipt pass.
Feature push CI base is the inspected comparison baseline; PR CI base is its
actual merge parent. Re-observe after base/head changes rather than reuse old green.

Missing or malformed fields block completeness. Inconsistent supplied CI attempts
also block: callers must not discard a newer failure in favor of older success.
Conflicts explain unavailable PR CI but do not count as success. Keep both push
and PR CI: they can test different trees. Existing required verification remains
unchanged; this checker is not wired into workflow or product runtime.

## Approval and 403 boundaries

All results include `authorizesAction: false`. A complete receipt is neither
permission to update a Draft nor permission to merge main or deploy. A branch's
suppression entry and prior approval never transfer to a new branch. Effective
project config and any matching wildcard true need independent inspection.

Known API write 403 adds a local-record note. Preserve the prepared text and exact
failure; do not retry the same refused request, acquire tokens or enlarge permissions.
A GitHub browser edit requires applicable human authorization for the exact existing
PR and supported surface. Do not switch to GUI automatically. Verify resulting
Draft/head/base/text through read-only API if an authorized edit actually occurs.
Unavailable operations remain explicitly unperformed.

## Verification and sources

Run `node --test scripts/tests/evidence-receipt.test.mjs` while developing, then the
unchanged required `npm run codex:verify` before commit/push. Existing tooling glob
automatically discovers this suite. Synthetic receipt tests are not live-provider,
OAuth or production-database acceptance.

References: [autonomous PM policy](AUTONOMOUS_PM_POLICY.md),
[Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration),
[GitHub pull-request events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request).
