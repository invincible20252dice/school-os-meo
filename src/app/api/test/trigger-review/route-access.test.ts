import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { generateGbpReviewReply, buildFallbackGbpReply } from "@/lib/gbp-webhook";
import { sendLineReviewNotification } from "@/lib/line";
import { POST } from "./route";

const auth = vi.hoisted(() => ({
  getUser: vi.fn(), maybeSingle: vi.fn(), from: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ createServerSupabaseClient: () => ({
  auth: { getUser: auth.getUser }, from: auth.from,
}) }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  schoolSetting: { findFirst: vi.fn() }, review: { create: vi.fn() },
} }));
vi.mock("@/lib/gbp-webhook", () => ({
  generateGbpReviewReply: vi.fn(), buildFallbackGbpReply: vi.fn(),
}));
vi.mock("@/lib/line", async () => ({
  ...await vi.importActual<typeof import("@/lib/line")>("@/lib/line"),
  sendLineReviewNotification: vi.fn(),
}));

function profile(role = "manager", status = "active") {
  return { id: "actor", role, status, school_id: "school-a", school_ids: ["school-a"] };
}
function request(schoolId: unknown = "school-a", bearer = "valid") {
  return new Request("http://localhost/api/test/trigger-review?schoolId=school-a&role=admin", {
    method: "POST", headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
    body: JSON.stringify({ schoolId, lineChannelAccessToken: "unsaved-token", lineDestinationId: "unsaved-destination" }),
  });
}
function expectNoEffects() {
  expect(prisma.schoolSetting.findFirst).not.toHaveBeenCalled();
  expect(prisma.review.create).not.toHaveBeenCalled();
  expect(generateGbpReviewReply).not.toHaveBeenCalled();
  expect(buildFallbackGbpReply).not.toHaveBeenCalled();
  expect(sendLineReviewNotification).not.toHaveBeenCalled();
  expect(auth.from.mock.calls.every(([table]) => table === "profiles")).toBe(true);
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.getUser.mockResolvedValue({ data: { user: { id: "actor", user_metadata: { role: "admin", status: "active" } } }, error: null });
  auth.maybeSingle.mockResolvedValue({ data: profile(), error: null });
  auth.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: auth.maybeSingle }) }) });
  vi.mocked(prisma.schoolSetting.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.review.create).mockResolvedValue({ id: "dummy-review" } as never);
  vi.mocked(generateGbpReviewReply).mockResolvedValue("synthetic reply");
  vi.mocked(sendLineReviewNotification).mockResolvedValue({ status: 200, requestId: null, destinationType: "group", destinationPreview: "synthetic" });
});
afterEach(() => vi.restoreAllMocks());

describe("notification authorization with real access resolver and service", () => {
  it("rejects no bearer even when query claims admin", async () => {
    expect((await POST(request("school-a", ""))).status).toBe(401);
    expect(auth.getUser).not.toHaveBeenCalled(); expectNoEffects();
  });
  it("rejects invalid bearer without entering send fallback", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    expect((await POST(request("school-a", "invalid"))).status).toBe(401); expectNoEffects();
  });
  it.each(["pending", "inactive"])("rejects %s profile without invitation writes", async status => {
    auth.maybeSingle.mockResolvedValue({ data: profile("manager", status), error: null });
    expect((await POST(request())).status).toBe(403); expectNoEffects();
  });
  it("rejects missing profile despite admin metadata", async () => {
    auth.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await POST(request())).status).toBe(403); expectNoEffects();
  });
  it("rejects a different school instead of coercing to the manager school", async () => {
    expect((await POST(request("school-b"))).status).toBe(403); expectNoEffects();
  });
  it.each([null, "", "all", "  ", 123])("requires explicit valid school %s", async school => {
    expect((await POST(request(school))).status).toBe(400); expectNoEffects();
  });
  it.each(["auth", "profile"])("fails closed on %s lookup error", async source => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    if (source === "auth") auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
    else auth.maybeSingle.mockResolvedValue({ data: null, error: { message: "private provider error" } });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private provider error");
    expectNoEffects(); expect(log.mock.calls.flat().join(" ")).not.toContain("private provider error");
  });
  it.each(["manager", "admin"])("preserves authorized %s unsaved-input, dummy-save and notification behavior", async role => {
    auth.maybeSingle.mockResolvedValue({ data: profile(role), error: null });
    const schoolId = role === "admin" ? "school-b" : "school-a";
    const response = await POST(request(schoolId));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ saved: true, notified: true });
    expect(auth.getUser).toHaveBeenCalledWith("valid");
    expect(prisma.schoolSetting.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { schoolId } }));
    expect(prisma.review.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ schoolId, source: "GOOGLE", status: "GENERATED" }) }));
    expect(sendLineReviewNotification).toHaveBeenCalledWith(expect.objectContaining({ channelAccessToken: "unsaved-token", to: "unsaved-destination" }), expect.any(Function));
    expect(auth.from.mock.calls.map(([table]) => table)).toEqual(["profiles"]);
  });
});
