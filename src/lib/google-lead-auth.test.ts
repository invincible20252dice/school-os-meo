import { beforeEach, expect, it, vi } from "vitest";
import { GET, PATCH } from "@/app/api/dashboard/google-results/route";
const boundary = vi.hoisted(() => ({ profile: null as Record<string, unknown> | null, tables: [] as string[], school: vi.fn() }));
vi.mock("./supabase", () => ({ createServerSupabaseClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: "u", user_metadata: { role: "admin", school_id: "b" } } }, error: null }) },
  from: (table: string) => {
    boundary.tables.push(table);
    if (table !== "profiles") throw new Error("Lead access must not read invitations or cause profile writes");
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: boundary.profile, error: null }) }) }) };
  },
}) }));
vi.mock("./prisma", () => ({ prisma: { school: { findUnique: boundary.school }, googleLead: { findMany: async () => [] } } }));
const request = (school = "a") => new Request(`https://example.test/api/dashboard/google-results?schoolId=${school}`, { headers: { authorization: "Bearer test-session" } });
beforeEach(() => { boundary.profile = null; boundary.tables = []; boundary.school.mockReset().mockResolvedValue({ id: "a", name: "A" }); });
it.each([null, "", "pending", "suspended"])("requires an explicitly active stored profile (%s), without invitation writes", async status => {
  boundary.profile = status === null ? null : { id: "u", role: "admin", status };
  expect((await GET(request())).status).toBe(403);
  expect((await PATCH(request())).status).toBe(403);
  expect(boundary.tables).toEqual(["profiles", "profiles"]);
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
