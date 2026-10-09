import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { AioRequestError, loadAioMeasurements, runAioMeasurement } from "@/lib/aio-measurement";
import { aioPilot } from "@/lib/aio-pilot";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/supabase-access", () => ({ resolveRequestAccess: vi.fn() }));
vi.mock("@/lib/aio-measurement", async importOriginal => ({ ...await importOriginal<object>(), loadAioMeasurements: vi.fn(), runAioMeasurement: vi.fn() }));
const access = { isAuthenticated: true, access: { userId: "u", role: "manager" as const, schoolIds: ["a"], schoolId: "a", status: "active" as const, name: "", email: "", source: "profiles" as const } };
const request = (schoolId = "a", body?: string) => new Request("http://localhost/api/dashboard/aio?schoolId=" + schoolId, body === undefined ? {} : { method: "POST", body });
const admin = () => vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, role: "admin" } });
const pilotRequest = (requestId = "client-id") => request(aioPilot.schoolId, JSON.stringify({ keywordId: aioPilot.keywordId, requestId }));
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("DATABASE_URL", "unit-test-only-not-connected");
  vi.mocked(resolveRequestAccess).mockResolvedValue(access);
  vi.mocked(loadAioMeasurements).mockResolvedValue({ keywords: [], configured: true, pilotKeywordId: null, school: null, competitors: [] });
});
afterEach(() => vi.unstubAllEnvs());
it("requires login", async () => {
  vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, isAuthenticated: false });
  expect((await GET(request())).status).toBe(401);
});
it("requires approval", async () => {
  vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, status: "pending" } });
  expect((await GET(request())).status).toBe(403);
});
it.each([["", 400], ["all", 400], ["b", 403]])("rejects scope %s", async (id, status) => {
  expect((await GET(request(id as string))).status).toBe(status);
  expect(loadAioMeasurements).not.toHaveBeenCalled();
});
it("returns configuration failure without DB calls", async () => {
  vi.stubEnv("DATABASE_URL", "");
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ code: "DB_NOT_CONFIGURED", error: "設定が必要（DB接続）" });
  expect(loadAioMeasurements).not.toHaveBeenCalled();
});
it("reads authenticated scoped data without caching", async () => {
  const response = await GET(request());
  expect(await response.json()).toMatchObject({ success: true, keywords: [] });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(loadAioMeasurements).toHaveBeenCalledWith({}, "a");
  expect(resolveRequestAccess).toHaveBeenCalledWith(expect.any(Request), expect.any(URL), undefined, { requireActiveProfile: true });
});
it.each(["{", "null", "{}", '{"keywordId":1}', '{"keywordId":"k","requestId":"id","provider":"gemini"}'])("rejects malformed input", async body => {
  admin();
  expect((await POST(request(aioPilot.schoolId, body))).status).toBe(400);
  expect(runAioMeasurement).not.toHaveBeenCalled();
});
it("runs one keyword only", async () => {
  admin();
  expect((await POST(pilotRequest())).status).toBe(200);
  expect(runAioMeasurement).toHaveBeenCalledWith({}, aioPilot.schoolId, aioPilot.keywordId, "client-id");
});
it("redacts unknown failures and handles safe known errors", async () => {
  vi.mocked(loadAioMeasurements).mockRejectedValue(new Error("secret"));
  const response = await GET(request());
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret");
  vi.mocked(runAioMeasurement).mockRejectedValue(new AioRequestError("BUSY", 409));
  admin();
  expect((await POST(pilotRequest())).status).toBe(409);
});
it("denies managers even with access to the pilot school", async () => {
  vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, schoolId: aioPilot.schoolId, schoolIds: [aioPilot.schoolId] } });
  expect((await POST(pilotRequest())).status).toBe(403);
  expect(runAioMeasurement).not.toHaveBeenCalled();
});
it("denies other schools even for an admin and delegates owned-keyword validation", async () => {
  admin();
  expect((await POST(request("a", '{"keywordId":"k","requestId":"id"}'))).status).toBe(403);
  expect(runAioMeasurement).not.toHaveBeenCalled();
  vi.mocked(runAioMeasurement).mockRejectedValue(new AioRequestError("NOT_FOUND", 404));
  expect((await POST(request(aioPilot.schoolId, '{"keywordId":"foreign","requestId":"id"}'))).status).toBe(404);
});
it("passes request IDs to transaction-protected deduplication, allowing later new history", async () => {
  admin();
  await POST(pilotRequest("tab-one"));
  await POST(pilotRequest("tab-two"));
  expect(vi.mocked(runAioMeasurement).mock.calls.map(call => call[3])).toEqual(["tab-one", "tab-two"]);
});
it("advertises server-derived pilot permission, not a client role", async () => {
  expect(await (await GET(request())).json()).toMatchObject({ canMeasure: false, pilotKeywordId: aioPilot.keywordId });
  admin();
  expect(await (await GET(request(aioPilot.schoolId))).json()).toMatchObject({ canMeasure: true, pilotKeywordId: aioPilot.keywordId });
});
