import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
import { POST } from "../route";
import { prisma } from "@/lib/prisma";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { createLeadOperationKey } from "@/lib/google-lead-operation-key";

vi.mock("@/lib/prisma", () => ({ prisma: { school: { findUnique: vi.fn() }, googleLead: { findFirst: vi.fn(), upsert: vi.fn() } } }));
vi.mock("@/lib/supabase-access", () => ({ resolveRequestAccess: vi.fn() }));
const userId = "11111111-2222-4333-8444-555555555555";
const foreignId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const nonce = "99999999-8888-4777-8666-555555555555";
const operationId = createLeadOperationKey(userId, "line", nonce);
const access = { isAuthenticated: true, access: { userId, role: "manager" as const, schoolIds: ["a"], schoolId: "a", status: "active" as const, name: "担当", email: "", source: "profiles" as const } };
const request = (key: string | null = operationId, school = "a") => new Request(`https://example.test/api/dashboard/google-results/operation-status?schoolId=${school}${key === null ? "" : `&operationId=${encodeURIComponent(key)}`}`);
const post = (key = operationId, channel = "line") => new Request("https://example.test/api/dashboard/google-results?schoolId=a", { method: "POST", body: JSON.stringify({ channel, idempotencyKey: key }) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(resolveRequestAccess).mockResolvedValue(access);
  vi.mocked(prisma.school.findUnique).mockResolvedValue({ id: "a", name: "校舎A" } as never);
  vi.mocked(prisma.googleLead.findFirst).mockResolvedValue({ channel: "line", version: 1, deletedAt: null } as never);
  vi.mocked(prisma.googleLead.upsert).mockResolvedValue({ id: "record-a", channel: "line", version: 1, deletedAt: null, idempotencyKey: operationId } as never);
});
afterEach(() => vi.restoreAllMocks());

it("rechecks authentication, active approval, and school authorization before any state query", async () => {
  vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, isAuthenticated: false });
  expect((await GET(request())).status).toBe(401);
  vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, status: "pending" } });
  expect((await GET(request())).status).toBe(403);
  vi.mocked(resolveRequestAccess).mockResolvedValue(access);
  expect((await GET(request(operationId, "b"))).status).toBe(403);
  expect(prisma.school.findUnique).not.toHaveBeenCalled();
  expect(prisma.googleLead.findFirst).not.toHaveBeenCalled();
  expect(resolveRequestAccess).toHaveBeenLastCalledWith(expect.any(Request), expect.any(URL), undefined, { requireActiveProfile: true });
});
it.each([null, "", nonce, "legacy-key", "gr1_bad", "gr1_" + "a".repeat(100)])("rejects missing/malformed/legacy operation IDs before the lead lookup (%s)", async key => {
  expect((await GET(request(key))).status).toBe(400);
  expect(prisma.googleLead.findFirst).not.toHaveBeenCalled();
});
it.each(["manager", "admin"] as const)("does not disclose another user's same-school operation to %s", async role => {
  vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, role } });
  const foreignKey = createLeadOperationKey(foreignId, "line", nonce);
  const response = await GET(request(foreignKey));
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ success: false, error: "この登録操作は確認できません。" });
  expect(prisma.googleLead.findFirst).not.toHaveBeenCalled();
  expect((await POST(post(foreignKey))).status).toBe(403);
  expect(prisma.googleLead.upsert).not.toHaveBeenCalled();
});
it.each([
  [null, "absent"],
  [{ channel: "line", version: 1, deletedAt: null }, "saved"],
  [{ channel: "phone", version: 1, deletedAt: null }, "changed"],
  [{ channel: "line", version: 2, deletedAt: null }, "changed"],
  [{ channel: "phone", version: 3, deletedAt: new Date() }, "deleted"],
] as const)("returns only a safe state for the operation, %s -> %s", async (row, expected) => {
  vi.mocked(prisma.googleLead.findFirst).mockResolvedValue(row as never);
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ success: true, state: expected });
  expect(prisma.googleLead.findFirst).toHaveBeenCalledWith({ where: { schoolId: "a", idempotencyKey: operationId, source: "google" }, select: { channel: true, version: true, deletedAt: true } });
  expect(prisma.googleLead.upsert).not.toHaveBeenCalled();
});
it("permits active administrators to check their own operation in an authorized school", async () => {
  vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, role: "admin" } });
  vi.mocked(prisma.school.findUnique).mockResolvedValue({ id: "b", name: "校舎B" } as never);
  expect((await GET(request(operationId, "b"))).status).toBe(200);
  expect(prisma.googleLead.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { schoolId: "b", idempotencyKey: operationId, source: "google" } }));
});
it("does not convert a missing school or failed status read into absent/saved", async () => {
  vi.mocked(prisma.school.findUnique).mockResolvedValueOnce(null);
  expect((await GET(request())).status).toBe(404);
  vi.mocked(prisma.googleLead.findFirst).mockRejectedValue(new Error("secret-database-url"));
  const response = await GET(request());
  expect(response.status).toBe(503);
  const json = await response.json();
  expect(json).not.toHaveProperty("state");
  expect(JSON.stringify(json)).not.toContain("secret");
});
it("validates reserved POST keys server-side and preserves legacy POST behavior without returning keys", async () => {
  expect((await POST(post(operationId, "phone"))).status).toBe(400);
  expect((await POST(post("gr1_bad"))).status).toBe(400);
  expect(prisma.googleLead.upsert).not.toHaveBeenCalled();
  for (const key of [operationId, nonce, "legacy-key"]) {
    const response = await POST(post(key));
    expect(response.status).toBe(200);
    expect((await response.json()).lead).not.toHaveProperty("idempotencyKey");
  }
});
