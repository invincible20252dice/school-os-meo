import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "./prisma";
import { loadChallengeData } from "./challenge-data";
vi.mock("./prisma", () => ({ prisma: { schoolSetting: { findUnique: vi.fn() }, instagramSetting: { findUnique: vi.fn() }, review: { findMany: vi.fn(), count: vi.fn() }, syncedPost: { findMany: vi.fn() }, targetKeyword: { findMany: vi.fn() }, survey: { findMany: vi.fn() }, searchQueryLog: { findMany: vi.fn() } } }));
const now = new Date("2026-10-02T09:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.instagramSetting.findUnique).mockResolvedValue(null);
  for (const model of [prisma.review, prisma.syncedPost, prisma.targetKeyword, prisma.survey, prisma.searchQueryLog]) vi.mocked(model.findMany).mockResolvedValue([]);
  vi.mocked(prisma.review.count).mockResolvedValue(0);
});
describe("challenge data reads", () => {
  it("keeps zero database rows distinct from unknown source measurements and scopes every query", async () => {
    const result = await loadChallengeData("a", null, now);
    expect(result.snapshot).toMatchObject({ google: false, instagram: false, reviews: { count: 0, rating: null, pending: 0, replyRate: null, newCount: null }, surveyResponses: null, posts: { count: 0, latestAt: null }, comparisons: [], errors: [] });
    for (const model of [prisma.review, prisma.syncedPost, prisma.targetKeyword, prisma.survey, prisma.searchQueryLog]) expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ schoolId: "a" }) }));
    expect(prisma.schoolSetting.findUnique).toHaveBeenCalledWith({ where: { schoolId: "a" }, select: { googleConnected: true, selectedGbpLocationId: true } });
    expect(prisma.review.count).not.toHaveBeenCalled();
  });
  it("computes snapshots using saved facts without calling Google or treating generated drafts as published", async () => {
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue({ googleConnected: true, selectedGbpLocationId: "locations/1" } as never);
    vi.mocked(prisma.instagramSetting.findUnique).mockResolvedValue({ instagramBusinessAccountId: "ig-1" } as never);
    vi.mocked(prisma.review.findMany).mockResolvedValue([
      { rating: 5, postedAt: now, repliedAt: now, replyText: "返信" },
      { rating: 3, postedAt: new Date("2026-09-01"), repliedAt: null, replyText: null },
      { rating: 0, postedAt: new Date("2026-10-03"), repliedAt: now, replyText: " " },
      { rating: 6, postedAt: now, repliedAt: now, replyText: null },
    ] as never);
    vi.mocked(prisma.review.count).mockResolvedValue(2);
    vi.mocked(prisma.syncedPost.findMany).mockResolvedValue([{ syncedAt: now }] as never);
    vi.mocked(prisma.targetKeyword.findMany).mockResolvedValue([{ keyword: "地域 塾", rankHistories: [{ id: "r", checkedAt: now, competitorData: [null, {}, { name: " " }, { name: "競合A", rating: 4, reviewCount: 12 }, { name: "競合B" }] }] }, { keyword: "空", rankHistories: [{ id: "z", checkedAt: now, competitorData: {} }] }] as never);
    const { snapshot } = await loadChallengeData("a", "2026-10-01", now);
    expect(snapshot).toMatchObject({ google: true, instagram: true, reviews: { count: 4, rating: 4, pending: 3, replyRate: 25, newCount: 2 }, surveyResponses: 2, posts: { count: 1, latestAt: now.toISOString() } });
    expect(snapshot.comparisons).toEqual([{ id: "r", keyword: "地域 塾", at: now.toISOString(), competitors: [{ name: "競合A", rating: 4, reviewCount: 12 }, { name: "競合B", rating: null, reviewCount: null }] }]);
    expect(prisma.review.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ source: "GOOGLE" }) }));
    expect(prisma.review.count).toHaveBeenCalledWith({ where: { schoolId: "a", source: "SURVEY", createdAt: { gte: new Date("2026-10-01"), lte: now } } });
  });
  it("does not infer publication dates from import dates", async () => {
    vi.mocked(prisma.review.findMany).mockResolvedValue([{ rating: null, postedAt: null, repliedAt: null, replyText: null }] as never);
    expect((await loadChallengeData("a", "2026-10-01", now)).snapshot.reviews?.newCount).toBeNull();
  });
  it("isolates failures as unavailable, not fabricated zeroes", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const fn of [prisma.schoolSetting.findUnique, prisma.instagramSetting.findUnique, prisma.review.findMany, prisma.review.count, prisma.syncedPost.findMany, prisma.targetKeyword.findMany, prisma.survey.findMany, prisma.searchQueryLog.findMany]) vi.mocked(fn).mockRejectedValue(new Error("secret"));
    const result = await loadChallengeData("a", "2026-10-01", now);
    expect(result.surveys).toBeNull();
    for (const key of ["google", "instagram", "reviews", "surveyResponses", "posts", "comparisons"] as const) expect(result.snapshot[key]).toBeNull();
    expect(result.snapshot.errors).toHaveLength(8);
    expect(JSON.stringify(spy.mock.calls)).not.toContain("secret");
    spy.mockRestore();
  });
  it("returns only the latest demand month and real nonfuture review dates", async () => {
    vi.mocked(prisma.searchQueryLog.findMany).mockResolvedValue([
      { query: "自習室", targetMonth: "2026-09", impressionCount: 20, updatedAt: now },
      { query: "個別", targetMonth: "2026-09", impressionCount: 10, updatedAt: now },
      { query: "古い", targetMonth: "2026-08", impressionCount: 99, updatedAt: now },
    ] as never);
    vi.mocked(prisma.review.findMany).mockResolvedValue([{ postedAt: now, rating: 5 }, { postedAt: new Date("2027-01-01"), rating: 4 }] as never);
    const { snapshot } = await loadChallengeData("a", null, now);
    expect(snapshot.latestReviewAt).toBe(now.toISOString());
    expect(snapshot.demand).toEqual([{ query: "自習室", month: "2026-09", impressions: 20, updatedAt: now.toISOString() }, { query: "個別", month: "2026-09", impressions: 10, updatedAt: now.toISOString() }]);
  });
});
