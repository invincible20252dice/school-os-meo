// Offline consistency checks for sanitized JSON-shaped observations, not permission.
// No IO, secrets, provider calls or release actions. Caller verifies source authenticity.
const object = value => value !== null && typeof value === "object" && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const sha = value => typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
const own = (value, key) => Object.hasOwn(value, key);
const text = value => typeof value === "string" && value.length > 0;
const plainBranch = value => typeof value === "string" && /^[A-Za-z0-9_./-]+$/.test(value);
const stringMap = value => object(value) && Object.values(value).every(text);

/** Returns fixed reason codes only. Completeness never grants action authority.
 * Accept JSON-shaped data, not objects with getters/proxies. Include latest CI
 * attempts only; conflicting supplied attempts are deliberately not ignored.
 */
export function assessReceipt(input) {
  const blockers = [], notes = [];
  const result = () => ({ status: blockers.length ? "BLOCKED" : "EVIDENCE_COMPLETE", blockers, notes, authorizesAction: false });
  if (!object(input)) { blockers.push("invalid_record"); return result(); }
  const { head, base, tree, branch } = input;
  if (input.repo !== "invincible20252dice/school-os-meo") blockers.push("wrong_repository");
  if (!plainBranch(branch) || !branch.startsWith("codex/")) blockers.push("unexpected_branch");
  if (![head, base, tree].every(sha)) blockers.push("invalid_full_sha");
  if (input.remoteHead !== head) blockers.push("remote_sha_changed");
  if (input.draft !== true || input.merged !== false) blockers.push("draft_state_changed");

  const mapping = input.deploymentEnabled;
  if (!object(mapping) || !own(mapping, branch) || mapping[branch] !== false
    || !Object.entries(mapping).every(([key, value]) => plainBranch(key) && typeof value === "boolean")
    || input.projectRootConfirmed !== true || input.alternateConfig !== false)
    blockers.push("deployment_unproven");

  const before = input.aliasesBefore, after = input.aliasesAfter, required = input.requiredAliases;
  if (input.observationsComplete !== true || input.deploymentCount !== 0
    || !Array.isArray(required) || required.length === 0 || !required.every(text)
    || !stringMap(before) || !stringMap(after)
    || Object.keys(before).length !== Object.keys(after).length
    || !Object.entries(before).every(([key, value]) => own(after, key) && after[key] === value)
    || !required.every(key => own(before, key)))
    blockers.push("production_observation_incomplete_or_changed");

  const verify = object(input.localVerify) ? input.localVerify : {};
  if (verify.head !== head || verify.tree !== tree || verify.success !== true)
    blockers.push("local_verification_missing_or_stale");
  const review = object(input.review) ? input.review : {};
  if (review.head !== head || review.independent !== true || review.unresolved !== 0)
    blockers.push("independent_review_missing_or_unresolved");

  let runs = input.ci;
  if (!Array.isArray(runs) || !runs.every(object)) { blockers.push("invalid_ci_evidence"); runs = []; }
  for (const event of ["push", "pull_request"]) {
    const matches = runs.filter(run => run.event === event && run.head === head && run.job === "Codex Verify");
    if (!matches.length || !matches.every(run => run.status === "completed" && run.conclusion === "success"
      && run.base === base && sha(run.checkout)
      && (event === "push" ? run.checkout === head : Array.isArray(run.mergeParents)
        && run.mergeParents.length === 2 && run.mergeParents.includes(head) && run.mergeParents.includes(base)))) {
      blockers.push(event === "pull_request" && input.conflict === true && !matches.length
        ? "pr_ci_unavailable_due_to_conflict" : `${event}_ci_missing_or_not_success`);
    }
  }
  if (input.apiWrite403 === true) notes.push("record_locally_do_not_retry_or_switch_gui");
  return result();
}
