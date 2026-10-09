import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { refreshAioPlaces } from "@/lib/aio-places";
import { PlacesError } from "@/lib/aio-places-provider";
import { aioPilot } from "@/lib/aio-pilot";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/supabase-access", () => ({ resolveRequestAccess: vi.fn() }));
vi.mock("@/lib/aio-places", () => ({ refreshAioPlaces: vi.fn() }));
const access = { isAuthenticated: true, access: { userId: "u", role: "admin" as const, schoolIds: [aioPilot.schoolId], schoolId: aioPilot.schoolId, status: "active" as const, name: "", email: "", source: "profiles" as const } };
const request = (body = '{"requestId":"id"}', school: string = aioPilot.schoolId, origin?: string) => new Request("http://localhost/api/dashboard/aio/places?schoolId=" + school, { method: "POST", body, headers: origin ? { origin } : {} });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("DATABASE_URL", "test-only"); vi.mocked(resolveRequestAccess).mockResolvedValue(access); vi.mocked(refreshAioPlaces).mockResolvedValue({ places: [], failures: [], requests: 0, reservedCalls: 3, competitorLimit: 1, asOf: "now" }); });
afterEach(() => vi.unstubAllEnvs());
it("requires authentication", async () => { vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, isAuthenticated: false }); expect((await POST(request())).status).toBe(401); expect(refreshAioPlaces).not.toHaveBeenCalled(); });
it.each(["pending", "manager", "school", "origin"])("rejects invalid access %s before any paid request", async type => {
  if (type === "pending") vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, status: "pending" } });
  if (type === "manager") vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, role: "manager" } });
  expect((await POST(request(undefined, type === "school" ? "foreign" : aioPilot.schoolId, type === "origin" ? "https://evil.invalid" : undefined))).status).toBe(403);
  expect(refreshAioPlaces).not.toHaveBeenCalled();
});
it.each(["{", "null", "{}", '{"requestId":"x","placeId":"foreign"}'])("rejects arbitrary inputs %s", async body => { expect((await POST(request(body))).status).toBe(400); expect(refreshAioPlaces).not.toHaveBeenCalled(); });
it("returns volatile values with no-store through school-scoped orchestration", async () => { const res = await POST(request()); expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toContain("no-store"); expect(refreshAioPlaces).toHaveBeenCalledWith({}, aioPilot.schoolId, "id"); });
it("reports safe codes without secrets", async () => {
  vi.mocked(refreshAioPlaces).mockRejectedValue(new Error("secret")); expect(await (await POST(request())).text()).not.toContain("secret");
  vi.mocked(refreshAioPlaces).mockRejectedValue(new PlacesError("DAILY_LIMIT", 429)); expect((await POST(request())).status).toBe(429);
  vi.stubEnv("DATABASE_URL", ""); expect((await POST(request())).status).toBe(503);
});
