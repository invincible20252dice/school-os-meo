import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { prisma } from "@/lib/prisma";
import { resolveRequestAccess } from "@/lib/supabase-access";

vi.mock("@/lib/prisma", () => ({ prisma: { school: { findMany: vi.fn() }, review: { findMany: vi.fn(), count: vi.fn() } } }));
vi.mock("@/lib/supabase-access", () => ({ resolveRequestAccess: vi.fn() }));
const access = { isAuthenticated: true, access: { userId: "u1", role: "manager" as const, schoolId: "s1", schoolIds: ["s1"], status: "active" as const, name: "担当者", email: "test@example.com", source: "profiles" as const } };
const request = (query = "") => new Request(`https://school.test/api/dashboard/reviews/analytics${query}`);
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(resolveRequestAccess).mockResolvedValue(access);
  vi.mocked(prisma.school.findMany).mockResolvedValue([{ id: "s1", name: "実校舎" }] as never);
  vi.mocked(prisma.review.findMany).mockResolvedValue([]);
  vi.mocked(prisma.review.count).mockResolvedValue(0);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("review analytics API", () => {
  it.each(["", "?schoolId=all", "?schoolId=s1"])("limits a manager to their assigned school (%s)", async query => {
    const response = await GET(request(query));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const data = await response.json();
    expect(data).toMatchObject({ schoolId: "s1", schoolName: "実校舎", totalReviews: 0, analyses: [], summary: { totalOpinions: 0 } });
    expect(prisma.review.findMany).toHaveBeenCalledWith({ where: { schoolId: { in: ["s1"] }, source: "GOOGLE", status: { not: "ARCHIVED" } }, select: { id: true, comment: true, originalText: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 });
    expect(prisma.review.count).toHaveBeenCalledWith({ where: { schoolId: { in: ["s1"] }, source: "GOOGLE", status: { not: "ARCHIVED" } } });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("extracts and aggregates actual DB text, ignoring ratings-only and generated replies", async () => {
    vi.mocked(prisma.review.findMany).mockResolvedValue([
      { id: "r1", comment: " 説明が丁寧。 ", originalText: "old text", aiReplyDraft: "not sent" },
      { id: "r2", comment: "", originalText: "待ち時間が長い。" },
      { id: "r3", comment: null, originalText: null },
    ] as never);
    vi.mocked(prisma.review.count).mockResolvedValue(3);
    const reviews = [
      { reviewId: "r1", language: "ja", opinions: [{ category: "指導品質・講師対応", sentiment: "positive", quote: "説明が丁寧" }] },
      { reviewId: "r2", language: "ja", opinions: [{ category: "運営・連絡", sentiment: "negative", quote: "待ち時間が長い" }] },
    ];
    vi.mocked(fetch).mockResolvedValue(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ reviews }) }] }] }));
    const data = await (await GET(request())).json();
    expect(data).toMatchObject({ totalReviews: 3, sampledReviews: 3, textReviews: 2, analyses: reviews, summary: { totalOpinions: 2, sentiment: { positive: 50, negative: 50, neutral: 0 } } });
    expect(data.categories).toHaveLength(2);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(JSON.parse(body.input)).toEqual([{ id: "r1", text: "説明が丁寧。" }, { id: "r2", text: "待ち時間が長い。" }]);
  });
  it.each(["", "?schoolId=all", "?schoolId=s1"])("permits admin scope (%s)", async query => {
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, role: "admin" } });
    const body = await (await GET(request(query))).json();
    expect(body.schoolId).toBe(query.endsWith("s1") ? "s1" : null);
    expect(prisma.school.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: query.endsWith("s1") ? { id: "s1" } : { status: "ACTIVE" } }));
  });
  it("does not widen an empty admin scope", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, role: "admin" } });
    vi.mocked(prisma.school.findMany).mockResolvedValue([]);
    expect((await GET(request())).status).toBe(200);
    expect(prisma.review.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ schoolId: { in: [] } }) }));
  });
  it("requires authentication even when an admin role is presented", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, isAuthenticated: false, access: { ...access.access, role: "admin" } });
    expect((await GET(request())).status).toBe(401);
    expect(prisma.school.findMany).not.toHaveBeenCalled();
  });
  it("rejects pending users and cross-school requests", async () => {
    expect((await GET(request("?schoolId=other"))).status).toBe(403);
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, status: "pending" } });
    expect((await GET(request())).status).toBe(403);
    expect(prisma.review.findMany).not.toHaveBeenCalled();
  });
  it.each(["", "wrong"])("rejects unassigned or inconsistent membership (%s)", async schoolId => {
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, schoolId, schoolIds: [] } });
    expect((await GET(request())).status).toBe(403);
    expect(prisma.review.findMany).not.toHaveBeenCalled();
  });
  it("uses validated membership when primary school is absent", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, schoolId: "" } });
    expect((await (await GET(request())).json()).schoolId).toBe("s1");
  });
  it("returns 404 for a deleted school", async () => {
    vi.mocked(prisma.school.findMany).mockResolvedValue([]);
    expect((await GET(request())).status).toBe(404);
    expect(prisma.review.findMany).not.toHaveBeenCalled();
  });
  it("does not hide DB failures behind empty/fake results", async () => {
    vi.mocked(prisma.review.findMany).mockRejectedValue(new Error("P2022 private SQL"));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, error: "口コミ分析データを取得できませんでした。時間をおいて再取得してください。" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private SQL");
  });
  it.each(["missing-key", "provider", "invalid"])("reports unavailable analysis (%s)", async mode => {
    vi.mocked(prisma.review.findMany).mockResolvedValue([{ id: "r1", comment: "実際の口コミ", originalText: null }] as never);
    if (mode === "missing-key") vi.stubEnv("OPENAI_API_KEY", "");
    else vi.mocked(fetch).mockResolvedValue(mode === "provider" ? new Response("error", { status: 429 }) : Response.json({ status: "incomplete" }));
    const response = await GET(request());
    expect(response.status).toBe(mode === "missing-key" ? 503 : 502);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.analyses).toBeUndefined();
  });
});
