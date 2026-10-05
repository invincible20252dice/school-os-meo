import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { generateGuideDraft } from "@/lib/action-guide-draft";
import { ChallengeError } from "@/lib/challenge";
vi.mock("@/lib/prisma", () => ({ prisma: { school: { findUnique: vi.fn() } } }));
vi.mock("@/lib/supabase-access", () => ({ resolveRequestAccess: vi.fn() }));
vi.mock("@/lib/action-guide-draft", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/action-guide-draft")>(), generateGuideDraft: vi.fn() }));
const access = { isAuthenticated: true, access: { userId: "u", role: "manager" as const, schoolIds: ["a"], schoolId: "a", status: "active" as const, name: "担当", email: "", source: "profiles" as const } };
const body = { purpose: "post", theme: "相談", facts: "予約制", schoolId: "b", school: { name: "攻撃" } };
const req = (school = "a", data = JSON.stringify(body)) => new Request(`https://example.com/api/dashboard/challenge/guide-draft?schoolId=${school}`, { method: "POST", body: data });
beforeEach(() => { vi.resetAllMocks(); vi.mocked(resolveRequestAccess).mockResolvedValue(access); vi.mocked(prisma.school.findUnique).mockResolvedValue({ name: "校舎A", addressLine: null, phoneNumber: null, websiteUrl: null } as never); vi.mocked(generateGuideDraft).mockResolvedValue("下書き"); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());
describe("authorized school guide drafting", () => {
  it("uses the authorized school, ignores body school overrides, never publishes", async () => {
    const res = await POST(req()); expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ success: true, draft: "下書き", published: false });
    expect(prisma.school.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a" } }));
    expect(generateGuideDraft).toHaveBeenCalledWith({ purpose: "post", theme: "相談", facts: "予約制", school: { name: "校舎A", addressLine: null, phoneNumber: null, websiteUrl: null } });
  });
  it("rejects unauthenticated, unapproved and other-school requests before DB", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValueOnce({ ...access, isAuthenticated: false }); expect((await POST(req())).status).toBe(401);
    vi.mocked(resolveRequestAccess).mockResolvedValueOnce({ ...access, access: { ...access.access, status: "pending" } }); expect((await POST(req())).status).toBe(403);
    expect((await POST(req("b"))).status).toBe(403); expect(prisma.school.findUnique).not.toHaveBeenCalled();
  });
  it.each(["", "all"])("requires concrete school %s", async school => expect((await POST(req(school))).status).toBe(400));
  it("requires school param and valid JSON", async () => {
    expect((await POST(new Request("https://example.com", { method: "POST" }))).status).toBe(400);
    expect((await POST(req("a", "bad"))).status).toBe(400);
    expect((await POST(req("a", "{}"))).status).toBe(400);
  });
  it("does not substitute a missing school", async () => { vi.mocked(prisma.school.findUnique).mockResolvedValue(null); expect((await POST(req())).status).toBe(404); expect(generateGuideDraft).not.toHaveBeenCalled(); });
  it("preserves known failures and sanitizes unexpected failures", async () => {
    vi.mocked(generateGuideDraft).mockRejectedValueOnce(new ChallengeError("接続未設定", 503)); expect(await (await POST(req())).json()).toMatchObject({ success: false, error: "接続未設定" });
    for (const error of [new Error("secret"), "secret"]) { vi.mocked(generateGuideDraft).mockRejectedValueOnce(error); const res = await POST(req()); expect(res.status).toBe(503); expect(JSON.stringify(await res.json())).not.toContain("secret"); }
  });
});
