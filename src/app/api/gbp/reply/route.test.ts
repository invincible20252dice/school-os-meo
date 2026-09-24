import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { DirectReplyError, publishDirectGbpReply } from "@/lib/gbp-direct-reply";
import { prisma } from "@/lib/prisma";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { GET as getReviews } from "../../reviews/route";

vi.mock("@/lib/supabase-access", async () => ({ ...await vi.importActual<typeof import("@/lib/supabase-access")>("@/lib/supabase-access"), resolveRequestAccess: vi.fn() }));
vi.mock("@/lib/gbp-direct-reply", async () => ({
  ...await vi.importActual<typeof import("@/lib/gbp-direct-reply")>("@/lib/gbp-direct-reply"),
  publishDirectGbpReply: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { review: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() } } }));

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
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.mocked(resolveRequestAccess).mockResolvedValue(access);
  vi.mocked(prisma.review.findUnique).mockResolvedValue(review() as never);
  vi.mocked(publishDirectGbpReply).mockResolvedValue({ googleReviewId: "accounts/1/locations/100/reviews/real", gbpReviewId: "real", replyText: normalizedReply, alreadyPublished: false });
  vi.mocked(prisma.review.update).mockResolvedValue({ id: "review-1", status: "REPLIED", replyText: normalizedReply, repliedAt: new Date("2026-09-24T00:00:00Z") } as never);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

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

  it.each([404, 500])("never marks a failed Google write as replied (%s)", async (googleStatus) => {
    vi.mocked(publishDirectGbpReply).mockRejectedValue(new DirectReplyError("GOOGLE_ERROR", "Googleが投稿を拒否しました", 502, googleStatus));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ success: false, googlePosted: false, googleStatus });
    expect(prisma.review.update).not.toHaveBeenCalled();
  });

  it.each([403, 429])("saves only the edited draft after provider refusal (%s)", async googleStatus => {
    vi.mocked(publishDirectGbpReply).mockRejectedValue(new DirectReplyError("GOOGLE_ERROR", "Google refusal", 502, googleStatus));
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ success: true, googlePosted: false, gbpPublished: false, draftSaved: true, deliveryStatus: "DRAFT_SAVED", warning: googleStatus === 429 ? "RATE_LIMITED" : "PERMISSION_DENIED", googleStatus });
    expect(body.message).toContain("Googleには未反映");
    expect(prisma.review.update).toHaveBeenCalledExactlyOnceWith({ where: { id: "review-1" }, data: { aiReplyText: normalizedReply, aiReplyDraft: normalizedReply }, select: { id: true } });
    expect(body.status).toBeUndefined();
    expect(vi.mocked(publishDirectGbpReply).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(prisma.review.update).mock.invocationCallOrder[0]);
  });

  it("does not claim draft persistence when the database refuses the write", async () => {
    vi.mocked(publishDirectGbpReply).mockRejectedValue(new DirectReplyError("GOOGLE_QUOTA_EXCEEDED", "quota", 429, 429));
    vi.mocked(prisma.review.update).mockRejectedValue(new Error("database secret"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ success: false, googlePosted: false, code: "DRAFT_SAVE_FAILED", googleStatus: 429 });
  });

  it("does not downgrade an already published reply when an attempted edit is refused", async () => {
    const stored = { ...review(), status: "REPLIED", replyText: "以前の公開本文", repliedAt: new Date("2026-09-01T00:00:00Z") };
    vi.mocked(prisma.review.findUnique).mockResolvedValue(stored as never);
    vi.mocked(publishDirectGbpReply).mockRejectedValue(new DirectReplyError("GOOGLE_ERROR", "quota", 429, 429));
    vi.mocked(prisma.review.update).mockImplementation(async args => Object.assign(stored, args.data) as never);
    await POST(request());
    expect(stored).toMatchObject({ status: "REPLIED", replyText: "以前の公開本文", repliedAt: new Date("2026-09-01T00:00:00Z"), aiReplyDraft: normalizedReply });
  });

  it("round-trips a quota-saved draft through the real reviews list serializer", async () => {
    const row = review();
    const stored = { ...row, school: { ...row.school, name: "対象校舎" }, source: "GOOGLE", status: "PENDING", aiReplyText: "元のドラフト", aiReplyDraft: "元のドラフト", replyText: null, repliedAt: null, aiReplyGeneratedAt: null, createdAt: new Date("2026-09-01T00:00:00Z") };
    vi.mocked(prisma.review.findUnique).mockResolvedValue(stored as never);
    vi.mocked(prisma.review.findMany).mockImplementation(async () => [stored] as never);
    vi.mocked(prisma.review.update).mockImplementation(async args => Object.assign(stored, args.data) as never);
    vi.mocked(publishDirectGbpReply).mockRejectedValue(new DirectReplyError("GOOGLE_QUOTA_EXCEEDED", "quota", 429, 429));
    expect((await (await POST(request())).json()).draftSaved).toBe(true);
    const response = await getReviews(new Request("https://example.com/api/dashboard/reviews?schoolId=school-1"));
    expect(response.status).toBe(200);
    expect((await response.json()).reviews[0]).toMatchObject({ id: "review-1", aiReplyText: normalizedReply, aiReplyDraft: normalizedReply, replyText: "", repliedAt: "", status: "PENDING" });
  });

  it.each(["token", "accounts", "list"].flatMap(stage => [403, 429].map(status => ({ stage, status }))))("saves drafts for $status during $stage without sending a Google write", async ({ stage, status }) => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
    const row = review();
    if (stage === "accounts") vi.mocked(prisma.review.findUnique).mockResolvedValue({ ...row, googleReviewId: "real", school: { ...row.school, gbpAccountId: null } } as never);
    const actual = await vi.importActual<typeof import("@/lib/gbp-direct-reply")>("@/lib/gbp-direct-reply");
    const network = vi.fn<typeof fetch>();
    if (stage !== "token") network.mockResolvedValueOnce(Response.json({ access_token: "fresh-token" }));
    network.mockResolvedValueOnce(Response.json({ error: { message: "provider refusal" } }, { status }));
    vi.mocked(publishDirectGbpReply).mockImplementation(input => actual.publishDirectGbpReply(input, network));
    const body = await (await POST(request())).json();
    expect(body).toMatchObject({ success: true, draftSaved: true, googlePosted: false, googleStatus: status });
    expect(network.mock.calls.every(([, init]) => init?.method !== "PUT")).toBe(true);
    expect(prisma.review.update).toHaveBeenCalledExactlyOnceWith({ where: { id: "review-1" }, data: { aiReplyText: normalizedReply, aiReplyDraft: normalizedReply }, select: { id: true } });
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

  it.each([200, 403, 429])("integrates the real OAuth/list/PUT pipeline with persistence (Google PUT=%s)", async (status) => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
    const actual = await vi.importActual<typeof import("@/lib/gbp-direct-reply")>("@/lib/gbp-direct-reply");
    const network = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ access_token: "fresh-token" }))
      .mockResolvedValueOnce(Response.json({ reviews: [{ reviewId: "real", name: "accounts/1/locations/100/reviews/real" }] }))
      .mockResolvedValueOnce(Response.json(status === 200 ? { comment: normalizedReply } : { error: { message: "provider refusal" } }, { status }));
    vi.mocked(publishDirectGbpReply).mockImplementation(input => actual.publishDirectGbpReply(input, network));
    const response = await POST(request());
    const body = await response.json();
    expect(network).toHaveBeenCalledTimes(3);
    expect(Object.fromEntries(network.mock.calls[0][1]?.body as URLSearchParams)).toMatchObject({ refresh_token: "setting-token", grant_type: "refresh_token" });
    expect(network.mock.calls[2]).toEqual(["https://mybusiness.googleapis.com/v4/accounts/1/locations/100/reviews/real/reply", expect.objectContaining({ method: "PUT", body: JSON.stringify({ comment: normalizedReply }), headers: { Authorization: "Bearer fresh-token", "Content-Type": "application/json" } })]);
    if (status === 200) {
      expect(response.status).toBe(200);
      expect(body).toMatchObject({ success: true, googlePosted: true });
      expect(prisma.review.update).toHaveBeenCalledTimes(1);
      expect(network.mock.invocationCallOrder[2]).toBeLessThan(vi.mocked(prisma.review.update).mock.invocationCallOrder[0]);
    } else {
      expect(response.status).toBe(200);
      expect(body).toMatchObject({ success: true, googlePosted: false, draftSaved: true, googleStatus: status });
      expect(prisma.review.update).toHaveBeenCalledExactlyOnceWith({ where: { id: "review-1" }, data: { aiReplyText: normalizedReply, aiReplyDraft: normalizedReply }, select: { id: true } });
    }
    expect(JSON.stringify(body)).not.toMatch(/fresh-token|setting-token|test-secret/);
  });
});
