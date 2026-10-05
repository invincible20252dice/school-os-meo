import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { loadSearchKeywords } from "@/lib/google-search-keywords";
vi.mock("@/lib/supabase-access", () => ({ resolveRequestAccess: vi.fn() }));
vi.mock("@/lib/google-search-keywords", () => ({ loadSearchKeywords: vi.fn(), previousKeywordMonth: () => "2026-09" }));
const access = { isAuthenticated: true, access: { userId: "u", role: "manager" as const, schoolIds: ["a"], schoolId: "a", status: "active" as const, name: "担当", email: "", source: "profiles" as const } };
const req = (query = "schoolId=a") => new Request(`https://example.com/api/dashboard/analytics/queries/sync?${query}`, { method: "POST" });
beforeEach(() => { vi.resetAllMocks(); vi.mocked(resolveRequestAccess).mockResolvedValue(access); });
it("rejects unauthenticated, unapproved and cross-school before sync", async () => {
  vi.mocked(resolveRequestAccess).mockResolvedValueOnce({ ...access, isAuthenticated: false }); expect((await POST(req())).status).toBe(401);
  vi.mocked(resolveRequestAccess).mockResolvedValueOnce({ ...access, access: { ...access.access, status: "pending" } }); expect((await POST(req())).status).toBe(403);
  for (const query of ["", "schoolId=all", "schoolId=b"]) expect((await POST(req(query))).status).toBe(403);
  expect(loadSearchKeywords).not.toHaveBeenCalled();
});
it.each(["2026-13", "2026-10", "not-month"])("rejects invalid/incomplete month %s", async month => expect((await POST(req(`schoolId=a&month=${month}`))).status).toBe(400));
it.each(["AVAILABLE", "EMPTY", "DISCONNECTED", "API_ERROR", "DB_ERROR"] as const)("returns independent status %s", async status => {
  vi.mocked(loadSearchKeywords).mockResolvedValue({ status, rows: [] } as never);
  const response = await POST(req());
  expect(await response.json()).toEqual({ success: status === "AVAILABLE" || status === "EMPTY", status, rows: [] });
  expect(loadSearchKeywords).toHaveBeenCalledWith("a", "2026-09");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("uses the explicit authorized month", async () => {
  vi.mocked(loadSearchKeywords).mockResolvedValue({ status: "EMPTY", rows: [] } as never);
  await POST(req("schoolId=a&month=2026-08")); expect(loadSearchKeywords).toHaveBeenCalledWith("a", "2026-08");
});
