import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
const auth = vi.hoisted(() => ({ getUser: vi.fn(), maybeSingle: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createServerSupabaseClient: () => ({ auth: { getUser: auth.getUser }, from: auth.from }) }));
const db = vi.hoisted(() => ({ school: { findUnique: vi.fn() }, targetKeyword: { findFirst: vi.fn() }, instagramSetting: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const profile = (role = "manager", status = "active") => ({ id: "actor", role, status, school_id: "school-a", school_ids: ["school-a", "school-b"] });
const request = (schoolId = "school-b", token = "valid") => new Request(`http://localhost/api/instagram/preview?${new URLSearchParams({ schoolId, role: "admin" })}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "synthetic-not-a-key");
  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.getUser.mockResolvedValue({ data: { user: { id: "actor", user_metadata: { role: "admin" } } }, error: null });
  auth.maybeSingle.mockResolvedValue({ data: profile(), error: null });
  auth.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: auth.maybeSingle }) }) });
  db.school.findUnique.mockImplementation(async ({ where }) => ({ id: where.id, name: "Synthetic school", status: "ACTIVE", city: "Synthetic city", gbpLocationId: "locations/synthetic" }));
  db.targetKeyword.findFirst.mockResolvedValue(null);
  db.instagramSetting.findUnique.mockResolvedValue(null);
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  expect(auth.from.mock.calls.every(([table]) => table === "profiles")).toBe(true);
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
function noBusinessReads() { for (const model of Object.values(db)) for (const fn of Object.values(model)) expect(fn).not.toHaveBeenCalled(); }
it("rejects anonymous forged admin without business reads", async () => { expect((await GET(request("school-b", ""))).status).toBe(401); noBusinessReads(); });
it("rejects invalid bearer", async () => { auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } }); expect((await GET(request())).status).toBe(401); noBusinessReads(); });
it.each(["pending", "inactive"])("rejects %s admin", async status => { auth.maybeSingle.mockResolvedValue({ data: profile("admin", status), error: null }); expect((await GET(request())).status).toBe(403); noBusinessReads(); });
it("rejects missing stored profile despite admin metadata", async () => { auth.maybeSingle.mockResolvedValue({ data: null, error: null }); expect((await GET(request())).status).toBe(403); noBusinessReads(); });
it.each(["", " ", "all"])("requires one concrete school: %j", async school => { expect((await GET(request(school))).status).toBe(400); noBusinessReads(); });
it("rejects another school's query", async () => { expect((await GET(request("school-c"))).status).toBe(403); noBusinessReads(); });
it.each(["auth", "profile"])("fails closed on %s lookup error", async source => {
  if (source === "auth") auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
  else auth.maybeSingle.mockResolvedValue({ data: null, error: { message: "sensitive" } });
  const response = await GET(request()); expect(response.status).toBe(500); expect(await response.text()).not.toContain("sensitive"); noBusinessReads();
});
it.each(["manager", "admin"])("scopes %s preview to the exact school and never calls a provider", async role => {
  auth.maybeSingle.mockResolvedValue({ data: profile(role), error: null });
  const response = await GET(request()); const body = await response.json();
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(body.preview.school.id).toBe("school-b");
  expect(db.school.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "school-b" } }));
  expect(db.targetKeyword.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { schoolId: "school-b", isActive: true } }));
  expect(db.instagramSetting.findUnique).toHaveBeenCalledWith({ where: { schoolId: "school-b" }, select: { lastSyncedAt: true } });
});
it.each([null, { id: "school-b", status: "INACTIVE" }])("does not substitute another school when requested school unavailable", async school => {
  db.school.findUnique.mockResolvedValue(school); expect((await GET(request())).status).toBe(404);
  expect(db.targetKeyword.findFirst).not.toHaveBeenCalled(); expect(db.instagramSetting.findUnique).not.toHaveBeenCalled();
});
it.each(["school", "keyword", "setting"])("reports %s read error without sample success or details", async source => {
  const fn = source === "school" ? db.school.findUnique : source === "keyword" ? db.targetKeyword.findFirst : db.instagramSetting.findUnique;
  fn.mockRejectedValue(new Error("sensitive")); const response = await GET(request()); expect(response.status).toBe(500); expect(await response.text()).not.toContain("sensitive");
});
it.each([null, "", "invalid", "32.8"])("serializes bounded preview coordinates from %j", async latitude => {
  db.targetKeyword.findFirst.mockResolvedValue({ keyword: "Synthetic keyword", nearestStation: "Synthetic station", municipality: "Synthetic municipality", latitude, longitude: "130.7", radiusMeters: 500 });
  db.instagramSetting.findUnique.mockResolvedValue({ lastSyncedAt: new Date("2026-01-01") });
  const body = await (await GET(request())).json();
  expect(body.dashboardData.location.latitude).toBe(latitude === "32.8" ? 32.8 : 32.8016);
  expect(body.dashboardData.location.longitude).toBe(130.7); expect(body.dashboardData.instagramSetting.lastSyncedAt).toBe("2026-01-01T00:00:00.000Z");
});
it("keeps absent GBP location empty rather than substituting a live default", async () => {
  db.school.findUnique.mockResolvedValue({ id: "school-b", name: "Synthetic", status: "ACTIVE", city: null, gbpLocationId: null });
  expect((await (await GET(request())).json()).preview.gbpPostPayload.locationId).toBe("");
});
