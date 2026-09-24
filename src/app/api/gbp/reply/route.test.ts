import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { DirectReplyError, publishDirectGbpReply } from "@/lib/gbp-direct-reply";
import { prisma } from "@/lib/prisma";
import { resolveRequestAccess } from "@/lib/supabase-access";

vi.mock("@/lib/supabase-access", () => ({ resolveRequestAccess: vi.fn() }));
vi.mock("@/lib/gbp-direct-reply", async () => ({
  ...await vi.importActual<typeof import("@/lib/gbp-direct-reply")>("@/lib/gbp-direct-reply"),
  publishDirectGbpReply: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { review: { findUnique: vi.fn(), update: vi.fn() } } }));

const access = {
  isAuthenticated: true,
  access: { userId: "manager-1", role: "manager" as const, schoolId: "school-1", schoolIds: ["school-1"], name: "Manager", email: "manager@example.com", status: "active" as const, source: "profiles" as const },
};
function review() {
  return {
    id: "review-1", schoolId: "school-1", googleReviewId: "accounts/1/locations/100/reviews/real", gbpReviewId: "real",
    authorName: "投稿者", parentName: null, originalText: "口コミ本文", comment: null, rating: 5,
    school: {
      gbpAccountId: "accounts/1", gbpLocationId: "locations/old",
      schoolSetting: { googleRefreshToken: "setting-token", selectedGbpLocationId: "locations/100", googleAccountId: "owner@example.com" },
      googleAccount: { refreshToken: "account-token", locationId: "locations/200" },
    },
  };
}
const payload = { reviewId: "review-1", schoolId: "school-1", replyText: "  ありがとうございます。\\n今後ともよろしくお願いします。  " };
const normalizedReply = "ありがとうございます。\n今後ともよろしくお願いします。";
const request = (body: unknown = payload) => new Request("https://example.com/api/dashboard/reviews/reply", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(resolveRequestAccess).mockResolvedValue(access);
  vi.mocked(prisma.review.findUnique).mockResolvedValue(review() as never);
  vi.mocked(publishDirectGbpReply).mockResolvedValue({ googleReviewId: "accounts/1/locations/100/reviews/real", gbpReviewId: "real", replyText: normalizedReply, alreadyPublished: false });
  vi.mocked(prisma.review.update).mockResolvedValue({ id: "review-1", status: "REPLIED", replyText: normalizedReply, repliedAt: new Date("2026-09-24T00:00:00Z") } as never);
});
afterEach(() => vi.restoreAllMocks());

describe("GBP direct reply API", () => {
  it.each(["", "?reviewId=review-1"])("GET never publishes and redirects to the editor %s", async (query) => {
    const response = await GET(new Request(`https://example.com/api/gbp/reply${query}`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`https://example.com/dashboard/reviews${query}`);
    expect(publishDirectGbpReply).not.toHaveBeenCalled();
  });

  it("posts using server-owned school credentials and only then marks the review replied", async () => {
    const response = await POST(request({ ...payload, authorName: "攻撃者が指定した名前" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, googlePosted: true, gbpPublished: true, deliveryStatus: "GOOGLE_POSTED", review: { status: "REPLIED", replyText: normalizedReply } });
    expect(publishDirectGbpReply).toHaveBeenCalledWith({
      refreshToken: "setting-token", locationId: "locations/100", accountId: "accounts/1",
      review: { googleReviewId: "accounts/1/locations/100/reviews/real", gbpReviewId: "real", authorName: "投稿者", originalText: "口コミ本文", rating: 5 }, replyText: normalizedReply,
    });
    expect(prisma.review.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "review-1" },
      data: expect.objectContaining({ googleReviewId: "accounts/1/locations/100/reviews/real", gbpReviewId: "real", source: "GOOGLE", status: "REPLIED", replyText: normalizedReply, aiReplyDraft: normalizedReply }),
    }));
    expect(vi.mocked(publishDirectGbpReply).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(prisma.review.update).mock.invocationCallOrder[0]);
  });

  it("accepts an approved admin for any school", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, role: "admin", schoolIds: [] } });
    expect((await POST(request())).status).toBe(200);
  });

  it("uses this school's GoogleAccount credentials when SchoolSetting is absent", async () => {
    const row = review();
    vi.mocked(prisma.review.findUnique).mockResolvedValue({ ...row, school: { ...row.school, gbpAccountId: null, schoolSetting: null } } as never);
    await POST(request());
    expect(publishDirectGbpReply).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: "account-token", locationId: "locations/200", accountId: "" }));
  });

  it("uses only existing legacy fields of the same record when canonical fields are empty", async () => {
    const row = review();
    vi.mocked(prisma.review.findUnique).mockResolvedValue({ ...row, authorName: null, parentName: "保護者", originalText: null, comment: "保存済み口コミ", school: { ...row.school, gbpAccountId: null, googleAccount: null, schoolSetting: { googleAccountId: "accounts/2", googleRefreshToken: null, selectedGbpLocationId: null } } } as never);
    await POST(request({ ...payload, schoolId: undefined }));
    expect(publishDirectGbpReply).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: "", accountId: "accounts/2", locationId: "locations/old", review: expect.objectContaining({ authorName: "保護者", originalText: "保存済み口コミ" }) }));
  });

  it("does not invent missing credentials or identity data", async () => {
    const row = review();
    vi.mocked(prisma.review.findUnique).mockResolvedValue({ ...row, authorName: null, parentName: null, originalText: null, comment: null, school: { gbpAccountId: null, gbpLocationId: null, schoolSetting: null, googleAccount: null } } as never);
    vi.mocked(publishDirectGbpReply).mockRejectedValue(new DirectReplyError("GOOGLE_NOT_CONNECTED", "再連携してください"));
    expect((await POST(request())).status).toBe(409);
    expect(publishDirectGbpReply).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: "", accountId: "", locationId: "", review: expect.objectContaining({ authorName: "", originalText: "" }) }));
    expect(prisma.review.update).not.toHaveBeenCalled();
  });

  it.each([null, {}, { ...payload, reviewId: 123 }, { ...payload, replyText: "\\n " }, { ...payload, replyText: "あ".repeat(4097) }])("rejects invalid input without posting: %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(prisma.review.findUnique).not.toHaveBeenCalled();
    expect(publishDirectGbpReply).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON", async () => {
    expect((await POST(new Request("https://example.com/api/gbp/reply", { method: "POST", body: "{" }))).status).toBe(400);
  });

  it("requires authentication even if a caller claims admin", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, isAuthenticated: false, access: { ...access.access, role: "admin", source: "fallback" } });
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(prisma.review.findUnique).not.toHaveBeenCalled();
    expect(publishDirectGbpReply).not.toHaveBeenCalled();
  });

  it("rejects pending users before reading credentials", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, status: "pending" } });
    expect((await POST(request())).status).toBe(403);
    expect(prisma.review.findUnique).not.toHaveBeenCalled();
  });

  it("rejects managers outside the review's school", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValue({ ...access, access: { ...access.access, schoolId: "school-2", schoolIds: ["school-2"] } });
    expect((await POST(request())).status).toBe(403);
    expect(publishDirectGbpReply).not.toHaveBeenCalled();
    expect(prisma.review.update).not.toHaveBeenCalled();
  });

  it("rejects a mismatched school supplied by the browser", async () => {
    expect((await POST(request({ ...payload, schoolId: "other-school" }))).status).toBe(409);
    expect(publishDirectGbpReply).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown review", async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue(null);
    expect((await POST(request())).status).toBe(404);
    expect(publishDirectGbpReply).not.toHaveBeenCalled();
  });

  it.each([403, 404, 429, 500])("never marks a failed Google write as replied (%s)", async (googleStatus) => {
    vi.mocked(publishDirectGbpReply).mockRejectedValue(new DirectReplyError("GOOGLE_ERROR", "Googleが投稿を拒否しました", 502, googleStatus));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ success: false, googlePosted: false, googleStatus });
    expect(prisma.review.update).not.toHaveBeenCalled();
  });

  it("reports remote success separately if subsequent persistence fails", async () => {
    vi.mocked(prisma.review.update).mockRejectedValue(new Error("database secret connection string"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({ success: false, googlePosted: true, code: "GOOGLE_POSTED_DB_FAILED" });
    expect(body.message).not.toContain("secret");
  });

  it("does not call Google on database failure", async () => {
    vi.mocked(prisma.review.findUnique).mockRejectedValue(new Error("db unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ success: false, googlePosted: false });
    expect(publishDirectGbpReply).not.toHaveBeenCalled();
  });
});
