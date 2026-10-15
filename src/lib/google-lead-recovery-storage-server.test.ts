import { expect, it } from "vitest";
import { clearLeadRecovery, dropLeadRecovery, initializeLeadRecoveryDocument, nextLeadRecoveryExpiry, pruneLeadRecovery, readLeadRecovery, saveLeadRecovery, updateLeadRecovery } from "./google-lead-recovery-storage";

it("never reads or creates persisted recovery state during server rendering", () => {
  const scope = { userId: "11111111-1111-4111-8111-111111111111", schoolId: "a", route: "/dashboard/roi" };
  expect(initializeLeadRecoveryDocument()).toBe(false);
  expect(readLeadRecovery(scope)).toEqual({ ok: false, operations: [] });
  expect(saveLeadRecovery({ ...scope, operationId: "untrusted", startedAt: Date.now(), state: "sending" })).toBe(false);
  expect(updateLeadRecovery("untrusted", "response_unknown", scope)).toBe(false);
  expect(dropLeadRecovery("untrusted")).toBe(false);
  expect(clearLeadRecovery()).toBe(false);
  expect(pruneLeadRecovery(scope)).toBe(false);
  expect(nextLeadRecoveryExpiry()).toBeNull();
});
