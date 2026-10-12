import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { fetchLatestInstagramMedia } from "@/lib/instagram";
import { formatInstagramCaptionForGbp } from "@/lib/ai-formatter";
import { POST } from "./route";
import { POST as cronPost } from "../../cron/sync-instagram/route";

const auth = vi.hoisted(() => ({ getUser: vi.fn(), maybeSingle: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createServerSupabaseClient: () => ({ auth: { getUser: auth.getUser }, from: auth.from }) }));
const db = vi.hoisted(() => ({
  instagramSetting: { findMany: vi.fn(), update: vi.fn() },
  syncedPost: { findUnique: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/instagram", () => ({ fetchLatestInstagramMedia: vi.fn() }));
vi.mock("@/lib/ai-formatter", () => ({ formatInstagramCaptionForGbp: vi.fn() }));

const settings = ["school-a", "school-b"].map(schoolId => ({
  id: `setting-${schoolId}`, schoolId, autoSyncEnabled: true,
  instagramAccessToken: "synthetic-token", instagramBusinessAccountId: schoolId,
  school: { id: schoolId, name: schoolId, gbpLocationId: `locations/${schoolId}` },
}));
function profile(role = "manager", status = "active", schoolIds = ["school-a"]) {
  return { id: "actor", role, status, school_id: "school-a", school_ids: schoolIds };
}
function request(schoolId: string | null = "school-a", bearer = "valid") {
  const query = new URLSearchParams({ role: "admin" });
  if (schoolId !== null) query.set("schoolId", schoolId);
  return new Request(`http://localhost/api/instagram/sync?${query}`, {
    method: "POST", headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  });
}
function expectNoEffects() {
  expect(prisma.instagramSetting.findMany).not.toHaveBeenCalled();
  expect(prisma.instagramSetting.update).not.toHaveBeenCalled();
  expect(prisma.syncedPost.findUnique).not.toHaveBeenCalled();
  expect(prisma.syncedPost.create).not.toHaveBeenCalled();
  expect(fetchLatestInstagramMedia).not.toHaveBeenCalled();
  expect(formatInstagramCaptionForGbp).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(auth.from.mock.calls.every(([table]) => table === "profiles")).toBe(true);
}
function expectSchoolEffects(schoolIds: string[]) {
  expect(prisma.syncedPost.create).toHaveBeenCalledTimes(schoolIds.length);
  expect(vi.mocked(prisma.syncedPost.create).mock.calls.map(([args]) => args.data.schoolId)).toEqual(schoolIds);
  expect(vi.mocked(prisma.instagramSetting.update).mock.calls.map(([args]) => args.where.id)).toEqual(schoolIds.map(id => `setting-${id}`));
  expect(vi.mocked(fetchLatestInstagramMedia).mock.calls.map(([setting]) => setting.instagramBusinessAccountId)).toEqual(schoolIds);
  expect(vi.mocked(formatInstagramCaptionForGbp).mock.calls.map(([input]) => input.schoolName)).toEqual(schoolIds);
  expect(vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(String(init?.body)).locationId)).toEqual(schoolIds.map(id => `locations/${id}`));
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("GBP_LOCAL_POSTS_API_URL", "https://gbp.example.invalid/localPosts");
  auth.getUser.mockResolvedValue({ data: { user: { id: "actor", user_metadata: { role: "admin", status: "active" } } }, error: null });
  auth.maybeSingle.mockResolvedValue({ data: profile(), error: null });
  auth.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: auth.maybeSingle }) }) });
  db.instagramSetting.findMany.mockImplementation(async (args: { where: { schoolId?: string } }) =>
    settings.filter(s => !args.where.schoolId || args.where.schoolId === s.schoolId));
  vi.mocked(prisma.syncedPost.findUnique).mockResolvedValue(null);
  vi.mocked(fetchLatestInstagramMedia).mockResolvedValue([{ instagramMediaId: "synthetic-media", caption: "synthetic", mediaType: "IMAGE", mediaUrl: "", permalink: "", postedAt: new Date() }]);
  vi.mocked(formatInstagramCaptionForGbp).mockResolvedValue("synthetic text");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "synthetic-gbp-post" })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("manual sync with real access resolver and sync service", () => {
  it("rejects no bearer despite forged admin scope", async () => {
    expect((await POST(request("all", ""))).status).toBe(401); expectNoEffects();
  });
  it("rejects invalid bearer", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    expect((await POST(request())).status).toBe(401); expectNoEffects();
  });
  it.each(["pending", "inactive"])("rejects %s admin without invitation writes", async status => {
    auth.maybeSingle.mockResolvedValue({ data: profile("admin", status), error: null });
    expect((await POST(request("all"))).status).toBe(403); expectNoEffects();
  });
  it("rejects missing profile despite admin metadata", async () => {
    auth.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await POST(request("all"))).status).toBe(403); expectNoEffects();
  });
  it.each([null, "", "  "])("requires explicit manager school (%s)", async school => {
    expect((await POST(request(school))).status).toBe(400); expectNoEffects();
  });
  it.each(["all", "school-b"])("rejects manager scope %s without coercion", async school => {
    expect((await POST(request(school))).status).toBe(403); expectNoEffects();
  });
  it.each(["auth", "profile"])("fails closed on %s lookup error without leaking it", async source => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    if (source === "auth") auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
    else auth.maybeSingle.mockResolvedValue({ data: null, error: { message: "private provider details" } });
    const response = await POST(request());
    expect(response.status).toBe(500); expect(await response.text()).not.toContain("private provider details");
    expect(log.mock.calls.flat().join(" ")).not.toContain("private provider details"); expectNoEffects();
  });
  it.each(["school-a", "school-b"])("runs only explicit assigned %s, including non-default assignment", async school => {
    auth.maybeSingle.mockResolvedValue({ data: profile("manager", "active", ["school-a", "school-b"]), error: null });
    const response = await POST(request(school));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ summary: { posted: 1 }, access: { effectiveSchoolId: school } });
    expect(prisma.instagramSetting.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { autoSyncEnabled: true, schoolId: school } }));
    expectSchoolEffects([school]); expect(auth.from.mock.calls.map(([table]) => table)).toEqual(["profiles"]);
  });
  it.each([null, "all", "school-b"])("preserves active admin scope %s", async school => {
    auth.maybeSingle.mockResolvedValue({ data: profile("admin"), error: null });
    expect((await POST(request(school))).status).toBe(200);
    expectSchoolEffects(school === "school-b" ? [school] : ["school-a", "school-b"]);
  });
  it("leaves authorized cron all-school processing independent of user sessions", async () => {
    vi.stubEnv("CRON_SECRET", "synthetic-cron");
    const response = await cronPost(new Request("http://localhost/api/cron/sync-instagram", { method: "POST", headers: { authorization: "Bearer synthetic-cron" } }));
    expect(response.status).toBe(200); expectSchoolEffects(["school-a", "school-b"]);
    expect(auth.getUser).not.toHaveBeenCalled(); expect(auth.from).not.toHaveBeenCalled();
  });
});
