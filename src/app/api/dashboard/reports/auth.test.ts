import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
const boundary = vi.hoisted(() => ({ profile: null as Record<string, unknown> | null, tables: [] as string[], school: vi.fn(), report: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createServerSupabaseClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: "u", user_metadata: { role: "admin", school_id: "b" } } }, error: null }) },
  from: (table: string) => {
    boundary.tables.push(table);
    if (table !== "profiles") throw new Error("Report reads must not read invitations or write profiles");
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: boundary.profile, error: null }) }) }) };
  },
}) }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  school: { findUnique: boundary.school },
  monthlyReport: { findUnique: boundary.report, findFirst: boundary.report },
  searchQueryLog: { findMany: async () => [] },
} }));
const request = (school = "a", token = true) => new Request(
  `https://example.test/api/dashboard/reports?schoolId=${school}&month=2026-08&role=admin&ownerId=foreign`,
  { headers: token ? { authorization: "Bearer synthetic-session", "x-user-role": "admin" } : {} },
);
beforeEach(() => {
  boundary.profile = null; boundary.tables = [];
  boundary.school.mockReset().mockImplementation(async ({ where }) => ({ id: where.id, name: where.id }));
  boundary.report.mockReset().mockResolvedValue({ targetMonth: "2026-08", totalReviews: 0, averageRating: 0, top3RankingRate: 0, aioScore: 0, searchImpression: 0, actionCount: 0 });
});
it("rejects tokenless fallback before accessing any data", async () => {
  expect((await GET(request("b", false))).status).toBe(401);
  expect(boundary.tables).toEqual([]);
  expect(boundary.school).not.toHaveBeenCalled();
});
it.each([null, "pending", "suspended"])("requires an active stored profile (%s) without invitation effects", async status => {
  boundary.profile = status === null ? null : { id: "u", role: "admin", status };
  expect((await GET(request())).status).toBe(403);
  expect(boundary.tables).toEqual(["profiles"]);
  expect(boundary.school).not.toHaveBeenCalled();
});
it("uses stored manager membership rather than editable metadata or request role claims", async () => {
  boundary.profile = { id: "u", role: null, school_id: "a", status: "active" };
  expect((await GET(request("b"))).status).toBe(403);
  expect(boundary.school).not.toHaveBeenCalled();
  const result = await GET(request("a"));
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect((await result.json()).school.id).toBe("a");
  expect(boundary.school).toHaveBeenCalledTimes(1);
  expect(boundary.report).toHaveBeenCalledWith({ where: { schoolId_targetMonth: { schoolId: "a", targetMonth: "2026-08" } } });
});
it("allows an active stored administrator to select the requested school", async () => {
  boundary.profile = { id: "u", role: "admin", status: "active" };
  const result = await GET(request("b"));
  expect(result.status).toBe(200);
  expect((await result.json()).school.id).toBe("b");
});
it.each([["a", "b"], ["b"]])("reads the explicitly authorized school without substituting the primary school (%j)", async (...schoolIds) => {
  boundary.profile = { id: "u", role: "manager", school_id: "a", school_ids: schoolIds, status: "active" };
  const result = await GET(request("b"));
  expect(result.status).toBe(200);
  expect((await result.json()).school.id).toBe("b");
  expect(boundary.school).toHaveBeenCalledWith({ where: { id: "b" }, select: { id: true, name: true } });
  expect(boundary.report).toHaveBeenCalledWith({ where: { schoolId_targetMonth: { schoolId: "b", targetMonth: "2026-08" } } });
});
