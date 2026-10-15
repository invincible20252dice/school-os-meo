import { expect, it } from "vitest";
import { createLeadOperationKey, parseLeadOperationKey, validateLeadCreateKey, validateLeadOperationKey } from "./google-lead-operation-key";
import type { LeadChannel } from "./google-leads";

const owner = "11111111-2222-4333-8444-555555555555";
const other = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const nonce = "99999999-8888-4777-8666-555555555555";
it.each(["line", "phone", "web", "other"] as const)("round-trips bounded %s operation keys using only opaque identity and channel", channel => {
  const key = createLeadOperationKey(owner.toUpperCase(), channel, nonce.toUpperCase());
  expect(key).toHaveLength(71);
  expect(key).toMatch(/^[a-zA-Z0-9_-]{1,80}$/);
  expect(parseLeadOperationKey(key)).toEqual({ userId: owner, channel });
  expect(validateLeadOperationKey(key, owner.toUpperCase(), channel)).toEqual({ userId: owner, channel });
  expect(() => validateLeadCreateKey(key, owner, channel)).not.toThrow();
});
it.each([null, undefined, 1, {}, [], "", nonce, "gr1_bad", "gr1_" + "a".repeat(90), "GR1_" + "a".repeat(64)])("rejects malformed or legacy recovery keys (%j)", value => {
  expect(parseLeadOperationKey(value)).toBeNull();
  expect(() => validateLeadOperationKey(value as string, owner)).toThrow();
});
it("rejects mismatched users and channels without accepting storage identity as authority", () => {
  const key = createLeadOperationKey(owner, "line", nonce);
  expect(() => validateLeadOperationKey(key, other)).toThrow(expect.objectContaining({ status: 403 }));
  expect(() => validateLeadCreateKey(key, "", "line")).toThrow();
  expect(() => validateLeadCreateKey(key, owner, "phone")).toThrow(expect.objectContaining({ status: 400 }));
  expect(() => validateLeadCreateKey("gr1_broken", owner, "line")).toThrow();
  expect(() => validateLeadCreateKey(nonce, other, "phone")).not.toThrow();
  expect(() => validateLeadCreateKey("legacy-request", "legacy-user", "web")).not.toThrow();
});
it("rejects email, non-UUID identity, invalid nonce and unsupported channels", () => {
  for (const id of ["user@example.test", "user-1", owner.replaceAll("-", ""), "", owner + "x"]) expect(() => createLeadOperationKey(id, "line", nonce)).toThrow();
  expect(() => createLeadOperationKey(owner, "line", "not-a-uuid")).toThrow();
  expect(() => createLeadOperationKey(owner, "constructor" as LeadChannel, nonce)).toThrow();
  expect(() => createLeadOperationKey(owner, "email" as LeadChannel, nonce)).toThrow();
});
