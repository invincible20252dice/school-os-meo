// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createLeadOperationKey } from "./google-lead-operation-key";
import type * as Recovery from "./google-lead-recovery-storage";

let storage: typeof Recovery;
const userId = "11111111-1111-4111-8111-111111111111";
const otherUser = "22222222-2222-4222-8222-222222222222";
const scope = { userId, schoolId: "a", route: "/dashboard/roi" };
const now = 1_800_000_000_000;
const key = "school-os.google-lead-recovery.v1";
const operation = (index = 0): Recovery.LeadRecoveryOperation => ({ ...scope, operationId: createLeadOperationKey(userId, "line", `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`), startedAt: now, state: "sending" });
function seed(value: unknown) { window.sessionStorage.setItem(key, JSON.stringify(value)); }
function navigation(type: string) { Object.defineProperty(window.performance, "getEntriesByType", { configurable: true, value: vi.fn(() => [{ type }]) }); }
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now); window.sessionStorage.clear();
  navigation("reload"); storage = await import("./google-lead-recovery-storage");
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("restores only a reload and initialization is stable across repeated effects", () => {
  seed([operation()]); expect(storage.initializeLeadRecoveryDocument()).toBe(true);
  navigation("navigate"); expect(storage.initializeLeadRecoveryDocument()).toBe(true);
  expect(storage.readLeadRecovery(scope)).toEqual({ ok: true, operations: [operation()] });
});
it.each(["navigate", "back_forward", "prerender"])("discards copied or restored document state for %s even without opener", (type) => {
  seed([operation()]); navigation(type); Object.defineProperty(window, "opener", { configurable: true, value: null });
  expect(storage.readLeadRecovery(scope)).toEqual({ ok: true, operations: [] });
  expect(window.sessionStorage.getItem(key)).toBeNull();
  expect(storage.saveLeadRecovery(operation())).toBe(true);
  expect(storage.readLeadRecovery(scope).operations).toHaveLength(1);
});
it("fails closed without navigation timing evidence", () => {
  seed([operation()]); Object.defineProperty(window.performance, "getEntriesByType", { configurable: true, value: () => { throw new Error("unsupported"); } });
  expect(storage.readLeadRecovery(scope).operations).toEqual([]);
});
it("treats empty navigation entries as a new navigation", () => {
  seed([operation()]); Object.defineProperty(window.performance, "getEntriesByType", { configurable: true, value: () => [] });
  expect(storage.readLeadRecovery(scope).operations).toEqual([]);
});
it("retains multiple operations, never overwrites one key and updates only an existing operation", () => {
  expect(storage.saveLeadRecovery(operation())).toBe(false);
  expect(storage.readLeadRecovery(scope)).toEqual({ ok: true, operations: [] });
  expect(storage.saveLeadRecovery(operation())).toBe(true);
  expect(storage.saveLeadRecovery(operation())).toBe(false);
  expect(storage.saveLeadRecovery(operation(1))).toBe(true);
  expect(storage.updateLeadRecovery(operation().operationId, "response_unknown", scope)).toBe(true);
  expect(storage.readLeadRecovery(scope).operations).toEqual([{ ...operation(), state: "response_unknown" }, operation(1)]);
  expect(storage.dropLeadRecovery(operation().operationId)).toBe(true);
  expect(storage.updateLeadRecovery(operation().operationId, "failed", scope)).toBe(false);
  expect(storage.readLeadRecovery(scope).operations).toEqual([operation(1)]);
  expect(storage.updateLeadRecovery(operation(1).operationId, "confirmed", scope)).toBe(true);
  expect(storage.readLeadRecovery(scope).operations).toEqual([{ ...operation(1), state: "confirmed" }]);
  expect(storage.dropLeadRecovery(operation(1).operationId)).toBe(true);
  expect(window.sessionStorage.getItem(key)).toBeNull();
});
it("expires at 24 hours without refreshing its start time on retry and drops future timestamps", () => {
  seed([operation()]); storage.readLeadRecovery(scope);
  vi.setSystemTime(now + storage.LEAD_RECOVERY_MAX_AGE_MS - 1);
  expect(storage.updateLeadRecovery(operation().operationId, "sending", scope)).toBe(true);
  expect(storage.nextLeadRecoveryExpiry()).toBe(now + storage.LEAD_RECOVERY_MAX_AGE_MS);
  vi.advanceTimersByTime(1);
  expect(storage.readLeadRecovery(scope).operations).toEqual([]);
  expect(window.sessionStorage.getItem(key)).toBeNull(); expect(storage.nextLeadRecoveryExpiry()).toBeNull();
  seed([{ ...operation(), startedAt: Date.now() + 1 }]); expect(storage.readLeadRecovery(scope).operations).toEqual([]);
});
it.each([
  null, {}, [null], [[]], [{ ...operation(), email: "not-allowed@example.invalid" }],
  [{ ...operation(), userId: "name@example.invalid" }], [{ ...operation(), userId: otherUser }],
  [{ ...operation(), schoolId: "all" }], [{ ...operation(), schoolId: "bad school" }],
  [{ ...operation(), route: "/dashboard" }], [{ ...operation(), startedAt: "1800000000000" }],
  [{ ...operation(), startedAt: 0 }], [{ ...operation(), state: "anything" }],
  [{ ...operation(), operationId: "legacy-key" }], [operation(), operation()],
  Array.from({ length: 65 }, (_, index) => operation(index)),
])("rejects malformed or unapproved storage value %#", (value) => {
  seed(value); expect(storage.readLeadRecovery(scope)).toEqual({ ok: true, operations: [] });
  expect(window.sessionStorage.getItem(key)).toBeNull();
});
it("rejects broken JSON and keeps acknowledged POST metadata until status/list confirmation", () => {
  window.sessionStorage.setItem(key, "{broken"); expect(storage.readLeadRecovery(scope).operations).toEqual([]);
  seed([{ ...operation(), state: "confirmed" }]); expect(storage.readLeadRecovery(scope).operations).toEqual([{ ...operation(), state: "confirmed" }]);
});
it.each([{ userId: otherUser }, { schoolId: "b" }, { route: "/dashboard" }])("invalidates mismatched context and rejects a stale update/save: %j", (change) => {
  seed([operation()]); storage.readLeadRecovery(scope);
  expect(storage.pruneLeadRecovery(change)).toBe(true); expect(window.sessionStorage.getItem(key)).toBeNull();
  expect(storage.updateLeadRecovery(operation().operationId, "response_unknown", scope)).toBe(false);
  expect(storage.saveLeadRecovery(operation())).toBe(false);
});
it("read prunes another scope; invalid scopes cannot create operations", () => {
  seed([operation()]); expect(storage.readLeadRecovery({ ...scope, schoolId: "b" }).operations).toEqual([]);
  expect(storage.readLeadRecovery({ ...scope, userId: "invalid" }).operations).toEqual([]);
  expect(storage.saveLeadRecovery(operation())).toBe(false);
});
it("clears only this feature and not auth or other metadata, and broadcasts invalidation", () => {
  seed([operation()]); window.sessionStorage.setItem("other", "untouched"); const listener = vi.fn();
  window.addEventListener(storage.LEAD_RECOVERY_CHANGED, listener);
  storage.readLeadRecovery(scope); expect(storage.clearLeadRecovery()).toBe(true);
  expect(listener).toHaveBeenCalledTimes(1); expect(window.sessionStorage.getItem("other")).toBe("untouched");
  expect(storage.saveLeadRecovery(operation())).toBe(false);
  expect(storage.updateLeadRecovery(operation().operationId, "response_unknown", scope)).toBe(false);
  window.removeEventListener(storage.LEAD_RECOVERY_CHANGED, listener);
});
it("refuses a 65th unresolved operation without dropping earlier ones", () => {
  seed(Array.from({ length: 64 }, (_, index) => operation(index))); storage.readLeadRecovery(scope);
  expect(storage.saveLeadRecovery(operation(64))).toBe(false); expect(storage.readLeadRecovery(scope).operations).toHaveLength(64);
});
it("rejects invalid new/update operations without saving arbitrary properties", () => {
  storage.readLeadRecovery(scope);
  expect(storage.saveLeadRecovery({ ...operation(), route: "/dashboard" })).toBe(false);
  expect(storage.saveLeadRecovery({ ...operation(), email: "no" } as Recovery.LeadRecoveryOperation)).toBe(false);
  expect(storage.updateLeadRecovery("unknown", "invalid" as Recovery.LeadRecoveryState, scope)).toBe(false);
});
it.each(["getItem", "setItem", "removeItem"] as const)("fails closed if storage %s is denied, including later stale responses", (method) => {
  seed([operation()]); storage.readLeadRecovery(scope);
  const spy = vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw new Error("denied"); });
  if (method === "setItem") expect(storage.saveLeadRecovery(operation(1))).toBe(false);
  else if (method === "removeItem") expect(storage.clearLeadRecovery()).toBe(false);
  else expect(storage.readLeadRecovery(scope).ok).toBe(false);
  spy.mockRestore();
  expect(storage.readLeadRecovery(scope)).toEqual({ ok: false, operations: [] });
  expect(storage.saveLeadRecovery(operation(2))).toBe(false);
  expect(storage.updateLeadRecovery(operation().operationId, "response_unknown", scope)).toBe(false);
  expect(storage.dropLeadRecovery(operation().operationId)).toBe(false);
  expect(storage.pruneLeadRecovery()).toBe(false); expect(storage.nextLeadRecoveryExpiry()).toBeNull();
});
it("handles denial while cleaning invalid or expired storage", () => {
  seed([{ ...operation(), startedAt: now - storage.LEAD_RECOVERY_MAX_AGE_MS }]);
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("denied"); });
  expect(storage.readLeadRecovery(scope)).toEqual({ ok: false, operations: [] });
});
it("handles denial while removing another scope", () => {
  seed([operation()]); vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("denied"); });
  expect(storage.readLeadRecovery({ ...scope, schoolId: "b" })).toEqual({ ok: false, operations: [] });
});
it("handles a denied sessionStorage getter", () => {
  vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => { throw new Error("denied"); });
  expect(storage.readLeadRecovery(scope)).toEqual({ ok: false, operations: [] });
  expect(storage.clearLeadRecovery()).toBe(false);
});

it("a late update from an old scope cannot delete a new scope's operations", () => {
  storage.readLeadRecovery(scope); storage.saveLeadRecovery(operation());
  const nextScope = { ...scope, schoolId: "b", userId: otherUser };
  const next = { ...operation(), ...nextScope, operationId: createLeadOperationKey(otherUser, "web", "44444444-4444-4444-8444-444444444444") };
  storage.pruneLeadRecovery(nextScope); storage.readLeadRecovery(nextScope); expect(storage.saveLeadRecovery(next)).toBe(true);
  expect(storage.updateLeadRecovery(operation().operationId, "response_unknown", scope)).toBe(false);
  expect(storage.readLeadRecovery(scope).operations).toEqual([]);
  expect(storage.readLeadRecovery(nextScope).operations).toEqual([next]);
});
