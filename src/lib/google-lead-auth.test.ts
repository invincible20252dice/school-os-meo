import { beforeEach, expect, it, vi } from "vitest";
import { GET, PATCH } from "@/app/api/dashboard/google-results/route";
import { GET as OPERATION_STATUS } from "@/app/api/dashboard/google-results/operation-status/route";
import { createLeadOperationKey } from "./google-lead-operation-key";
const boundary = vi.hoisted(() => ({ profile: null as Record<string, unknown> | null, tables: [] as string[], school: vi.fn(), operation: vi.fn(), userId: "u" }));
vi.mock("./supabase", () => ({ createServerSupabaseClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: boundary.userId, user_metadata: { role: "admin", school_id: "b" } } }, error: null }) },
  from: (table: string) => {
    boundary.tables.push(table);
    if (table !== "profiles") throw new Error("Lead access must not read invitations or cause profile writes");
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: boundary.profile, error: null }) }) }) };
  },
}) }));
vi.mock("./prisma", () => ({ prisma: { school: { findUnique: boundary.school }, googleLead: { findMany: async () => [], findFirst: boundary.operation } } }));
const request = (school = "a") => new Request(`https://example.test/api/dashboard/google-results?schoolId=${school}`, { headers: { authorization: "Bearer test-session" } });
beforeEach(() => { boundary.profile = null; boundary.tables = []; boundary.userId = "u"; boundary.school.mockReset().mockResolvedValue({ id: "a", name: "A" }); boundary.operation.mockReset().mockResolvedValue(null); });
it.each([null, "", "pending", "suspended"])("requires an explicitly active stored profile (%s), without invitation writes", async status => {
  boundary.profile = status === null ? null : { id: "u", role: "admin", status };
  expect((await GET(request())).status).toBe(403);
  expect((await PATCH(request())).status).toBe(403);
  expect((await OPERATION_STATUS(request())).status).toBe(403);
  expect(boundary.tables).toEqual(["profiles", "profiles", "profiles"]);
  expect(boundary.school).not.toHaveBeenCalled();
});
it("uses stored manager scope instead of user-editable admin metadata", async () => {
  boundary.profile = { id: "u", role: null, school_id: "a", status: "active" };
  expect((await GET(request("b"))).status).toBe(403);
  expect((await GET(request("a"))).status).toBe(200);
  expect(boundary.school).toHaveBeenCalledTimes(1);
});
it("permits an active stored administrator", async () => {
  boundary.profile = { id: "u", role: "admin", status: "active" };
  expect((await GET(request())).status).toBe(200);
});
it("binds recovery to the verified auth user, not browser-supplied owner or editable metadata", async () => {
  boundary.userId = "11111111-2222-4333-8444-555555555555";
  boundary.profile = { id: boundary.userId, role: "manager", school_id: "a", status: "active" };
  const foreign = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const key = createLeadOperationKey(foreign, "line", "99999999-8888-4777-8666-555555555555");
  const supplied = new Request(`https://example.test/api/dashboard/google-results/operation-status?schoolId=a&operationId=${key}&ownerId=${foreign}`, { headers: { authorization: "Bearer test-session", "x-user-role": "admin" } });
  expect((await OPERATION_STATUS(supplied)).status).toBe(403);
  expect(boundary.operation).not.toHaveBeenCalled();
  const own = createLeadOperationKey(boundary.userId, "line", "99999999-8888-4777-8666-555555555555");
  const response = await OPERATION_STATUS(new Request(`https://example.test/api/dashboard/google-results/operation-status?schoolId=a&operationId=${own}`, { headers: { authorization: "Bearer test-session" } }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, state: "absent" });
  expect(boundary.tables).toEqual(["profiles", "profiles"]);
});
