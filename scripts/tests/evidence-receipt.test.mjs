import { test } from "node:test";
import assert from "node:assert/strict";
import { assessReceipt } from "../evidence-receipt.mjs";

const head = "a".repeat(40), base = "b".repeat(40), tree = "c".repeat(40);
const fixture = () => ({
  repo: "invincible20252dice/school-os-meo", branch: "codex/example", head, base, tree,
  remoteHead: head, draft: true, merged: false,
  deploymentEnabled: { "codex/example": false }, projectRootConfirmed: true, alternateConfig: false,
  observationsComplete: true, deploymentCount: 0,
  requiredAliases: ["prod-one", "prod-two", "default"],
  aliasesBefore: { "prod-one": "d1", "prod-two": "d1", default: "d1" },
  aliasesAfter: { "prod-one": "d1", "prod-two": "d1", default: "d1" },
  localVerify: { head, tree, success: true }, review: { head, independent: true, unresolved: 0 },
  ci: [
    { event: "push", head, checkout: head, base, job: "Codex Verify", status: "completed", conclusion: "success" },
    { event: "pull_request", head, checkout: "d".repeat(40), base, job: "Codex Verify", status: "completed", conclusion: "success", mergeParents: [head, base] },
  ], conflict: false, apiWrite403: false,
});
const blocked = value => assert.equal(assessReceipt(value).status, "BLOCKED");

test("complete evidence is advisory, does not authorize actions or mutate inputs", () => {
  const value = fixture(), before = structuredClone(value);
  assert.deepEqual(assessReceipt(value), { status: "EVIDENCE_COMPLETE", blockers: [], notes: [], authorizesAction: false });
  assert.deepEqual(value, before);
});
test("missing or malformed receipt and nested containers fail closed", () => {
  for (const value of [null, true, [], 1, "secret"]) blocked(value);
  for (const field of ["localVerify", "review", "ci", "deploymentEnabled", "aliasesBefore", "aliasesAfter", "requiredAliases"]) {
    for (const value of [null, true, 1, "secret", [], [null]]) blocked({ ...fixture(), [field]: value });
  }
});
test("wrong repository, protected branch, invalid SHA and stale remote are blocked", () => {
  for (const [field, value] of [["repo", "other/repo"], ["branch", "main"], ["head", "abc"], ["base", null], ["tree", "abc"], ["remoteHead", base]])
    blocked({ ...fixture(), [field]: value });
});
test("old local verify or review SHA and a different verified tree are blocked", () => {
  for (const field of ["localVerify", "review"]) {
    const r = fixture(); r[field].head = base; blocked(r);
  }
  const r = fixture(); r.localVerify.tree = head; blocked(r);
});
test("verification failure and unresolved/non-independent review cannot pass", () => {
  for (const [field, key, value] of [["localVerify", "success", false], ["review", "independent", false], ["review", "unresolved", 1], ["review", "unresolved", false]]) {
    const r = fixture(); r[field][key] = value; blocked(r);
  }
});
test("new branch cannot inherit exact suppression or an inherited object property", () => {
  blocked({ ...fixture(), branch: "codex/new" });
  blocked({ ...fixture(), deploymentEnabled: Object.create({ "codex/example": false }) });
});
test("wildcard or nonboolean configuration and alternative config require inspection", () => {
  for (const mapping of [{ "codex/example": false, "*": true }, { "codex/example": false, "codex/*": false }, { "codex/example": 0 }, { "codex/example": false, other: "false" }])
    blocked({ ...fixture(), deploymentEnabled: mapping });
  blocked({ ...fixture(), alternateConfig: true });
  blocked({ ...fixture(), projectRootConfirmed: false });
});
test("Draft and unmerged state are independent requirements", () => {
  blocked({ ...fixture(), draft: false }); blocked({ ...fixture(), merged: true });
});
test("new deployments, absent observations and changed aliases block completion", () => {
  for (const value of [1, null, false, "0"]) blocked({ ...fixture(), deploymentCount: value });
  blocked({ ...fixture(), observationsComplete: false });
  const r = fixture(); r.aliasesAfter["prod-one"] = "d2"; blocked(r);
});
test("empty or partial equal alias maps cannot masquerade as unchanged production", () => {
  blocked({ ...fixture(), aliasesBefore: {}, aliasesAfter: {} });
  blocked({ ...fixture(), aliasesBefore: { default: "d1" }, aliasesAfter: { default: "d1" } });
  blocked({ ...fixture(), requiredAliases: [] });
  const r = fixture(); r.aliasesAfter.extra = "d1"; blocked(r);
});
test("alias object key order is immaterial but values and types are not", () => {
  const r = fixture(); r.aliasesAfter = { default: "d1", "prod-two": "d1", "prod-one": "d1" };
  assert.equal(assessReceipt(r).status, "EVIDENCE_COMPLETE");
  r.aliasesAfter.default = {}; blocked(r);
});
test("old or missing CI, wrong job and terminal non-success cannot pass", () => {
  for (const [key, value] of [["head", base], ["job", "Other"], ["status", "in_progress"], ["conclusion", "cancelled"], ["conclusion", "failure"]]) {
    const r = fixture(); r.ci[0][key] = value; blocked(r);
  }
  blocked({ ...fixture(), ci: [] });
});
test("both push head checkout and PR merge parent/base evidence are required", () => {
  for (const [index, key, value] of [[0, "checkout", base], [1, "checkout", null], [1, "base", head], [1, "mergeParents", [head, "e".repeat(40)]], [1, "mergeParents", [head]], [1, "mergeParents", [head, base, tree]]]) {
    const r = fixture(); r.ci[index][key] = value; blocked(r);
  }
});
test("old green never masks another supplied failed or pending attempt", () => {
  const r = fixture(); r.ci.push({ ...r.ci[0], conclusion: "failure" }); blocked(r);
});
test("conflict explains absent PR run without claiming integration success", () => {
  const r = fixture(); r.ci.pop(); r.conflict = true;
  assert.ok(assessReceipt(r).blockers.includes("pr_ci_unavailable_due_to_conflict")); blocked(r);
});
test("403 records local-only follow-up and never authorizes a browser switch", () => {
  const result = assessReceipt({ ...fixture(), apiWrite403: true });
  assert.deepEqual(result.notes, ["record_locally_do_not_retry_or_switch_gui"]);
  assert.equal(result.authorizesAction, false);
});
test("malformed CI entries fail closed without returning supplied values", () => {
  for (const value of [null, "PRIVATE_MARKER", false]) {
    const r = fixture(); r.ci.push(value); blocked(r);
    assert.ok(!JSON.stringify(assessReceipt(r)).includes("PRIVATE_MARKER"));
  }
});
