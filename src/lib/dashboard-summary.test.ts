import { describe, expect, it } from "vitest";
import { buildDashboardOverview, type OverviewRecords } from "./dashboard-summary";

const now = new Date("2026-09-24T00:00:00Z");
const empty = (): OverviewRecords => ({ reviews: [], keywords: [], queries: [], alerts: [] });
const review = (date: string, rating: number | null = 5, status = "PENDING") => ({ rating, status, repliedAt: null, postedAt: null, createdAt: new Date(date) });
const keyword = (id: string, rank: number | null, checkedAt = now) => ({ id, schoolId: "school-1", keyword: `検索語${id}`, rankHistories: [{ rank, checkedAt }], aioScoreHistories: [] });

describe("real dashboard aggregation", () => {
  it("does not invent reviews, ranks, scores, queries or tasks for an empty database", () => {
    expect(buildDashboardOverview(empty(), now)).toEqual({ month: "2026-09", reviews: { count: 0, rating: null, monthlyCount: 0, previousCount: 0, difference: 0 }, meo: null, aio: null, topQuery: null, pendingCount: 0, churn: { openCount: 0, inProgressCount: 0, highRiskCount: 0 }, actions: [] });
  });
  it("counts actual records, excludes unrated values from the mean, and honors reply completion", () => {
    const data = empty();
    data.reviews = [review("2026-09-01", 5), review("2026-09-02", 3, "PENDING_CUSTOM_REPLY"), review("2026-08-01", null, "DRAFT"), review("2026-07-01", 0, "REPLIED"), { ...review("2026-09-03", 8), repliedAt: now }];
    const result = buildDashboardOverview(data, now);
    expect(result.reviews).toEqual({ count: 5, rating: 4, monthlyCount: 3, previousCount: 1, difference: 2 });
    expect(result.pendingCount).toBe(2);
    expect(result.actions).toEqual([{ text: "未返信口コミ2件の返信案を確認してください。", path: "/dashboard/reviews" }]);
  });
  it("uses Japan month boundaries and original publication time instead of sync time", () => {
    const data = empty();
    data.reviews = [review("2025-12-31T14:59:59Z"), review("2025-12-31T15:00:00Z"), review("2026-01-31T14:59:59Z"), review("2026-01-31T15:00:00Z"), { ...review("2026-01-10"), postedAt: new Date("2025-12-20") }];
    const result = buildDashboardOverview(data, new Date("2025-12-31T15:00:00Z"));
    expect(result.month).toBe("2026-01");
    expect(result.reviews).toMatchObject({ monthlyCount: 2, previousCount: 2, difference: 0 });
  });
  it("selects the newest measured keyword and compares only its own previous rank", () => {
    const data = empty();
    data.keywords = [keyword("old", 1, new Date("2026-09-01")), { ...keyword("new", 4), rankHistories: [{ rank: 4, checkedAt: now }, { rank: 2, checkedAt: new Date("2026-09-10") }] }, { ...keyword("unmeasured", 1), rankHistories: [] }];
    const result = buildDashboardOverview(data, now);
    expect(result.meo).toMatchObject({ keyword: "検索語new", rank: 4, previousRank: 2, difference: -2, measuredAt: now.toISOString() });
    expect(result.actions[0].text).toContain("検索語new");
  });
  it.each([null, 1])("distinguishes outside-range and unmeasured ranks (%s)", (rank) => {
    const data = empty();
    data.keywords = [keyword("b", rank), keyword("a", rank)];
    const result = buildDashboardOverview(data, now);
    expect(result.meo).toMatchObject({ keyword: "検索語a", rank, previousRank: null, difference: null });
    expect(result.actions).toHaveLength(rank === null ? 1 : 0);
  });
  it("does not invent a difference when the previous rank was outside range", () => {
    const data = empty();
    data.keywords = [{ ...keyword("a", 2), rankHistories: [{ rank: 2, checkedAt: now }, { rank: null, checkedAt: now }] }];
    expect(buildDashboardOverview(data, now).meo?.difference).toBeNull();
  });
  it("averages latest AIO results per keyword and preserves measured zero", () => {
    const data = empty();
    const score = (n: number) => ({ totalScore: n, chatgptScore: n, geminiScore: n, googleAiScore: n, checkedAt: now });
    data.keywords = [{ ...keyword("a", 1), aioScoreHistories: [score(60), score(99)] }, { ...keyword("b", 2), aioScoreHistories: [score(0)] }];
    expect(buildDashboardOverview(data, now).aio).toEqual({ score: 30, chatGpt: 30, gemini: 30, googleAi: 30, keywordCount: 2 });
  });
  it("aggregates matching queries in the latest recorded month without mixing past months", () => {
    const data = empty();
    data.queries = [{ query: "古い検索語", targetMonth: "2026-08", impressionCount: 9999 }, { query: "熊本 大学受験 塾", targetMonth: "2026-09", impressionCount: 200 }, { query: "熊本 大学受験 塾", targetMonth: "2026-09", impressionCount: 250 }, { query: "別の検索語", targetMonth: "2026-09", impressionCount: 400 }];
    expect(buildDashboardOverview(data, now).topQuery).toEqual({ query: "熊本 大学受験 塾", month: "2026-09", impressionCount: 450 });
  });
  it("breaks equal query counts deterministically and keeps zero measurements", () => {
    const data = empty();
    data.queries = [{ query: "b", targetMonth: "2026-09", impressionCount: 0 }, { query: "a", targetMonth: "2026-09", impressionCount: 0 }];
    expect(buildDashboardOverview(data, now).topQuery?.query).toBe("a");
  });
  it("derives action counts from unresolved alerts, not a static advice template", () => {
    const data = empty();
    data.alerts = [{ status: "OPEN", riskLevel: "HIGH" }, { status: "IN_PROGRESS", riskLevel: "MEDIUM" }, { status: "IN_PROGRESS", riskLevel: "HIGH" }, { status: "RESOLVED", riskLevel: "HIGH" }];
    const result = buildDashboardOverview(data, now);
    expect(result.churn).toEqual({ openCount: 1, inProgressCount: 2, highRiskCount: 2 });
    expect(result.actions.map(action => action.text)).toEqual(["未対応の退塾防止アラート1件を確認してください。", "対応中の退塾防止アラート2件の進捗を確認してください。"]);
  });
});
