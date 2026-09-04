import { describe, expect, it } from "vitest";
import {
  buildDashboardReportPayload,
  buildReportFromAggregates,
  getCurrentReportMonth,
  normalizeQueryLogs,
} from "./dashboard-reports";

describe("dashboard-reports", () => {
  it("normalizes monthly report rows into the dashboard report shape", () => {
    const payload = buildDashboardReportPayload({
      school: { id: "school-1", name: "iスクール予備校" },
      month: "2026-08",
      report: {
        targetMonth: "2026-08",
        totalReviews: 2,
        averageRating: 5,
        top3RankingRate: 85,
        aioScore: 78,
        searchImpression: 1420,
        actionCount: 186,
        aiAnalysisSummary: "大学受験関連の検索露出が伸びています。",
      },
      queries: [
        {
          id: "query-1",
          query: "熊本 大学受験 塾",
          impressionCount: 420,
          clickCount: 58,
          growthRate: "+24%",
          intent: "地域",
        },
      ],
    });

    expect(payload.school.name).toBe("iスクール予備校");
    expect(payload.targetMonth).toBe("2026-08");
    expect(payload.report.period).toBe("2026年8月度");
    expect(payload.report.score).toBe(85);
    expect(payload.report.metrics[0]).toMatchObject({
      label: "口コミ獲得・返信率",
      value: "2件 / 5.0",
    });
    expect(payload.queries[0]).toMatchObject({
      query: "熊本 大学受験 塾",
      impressionCount: 420,
      count: 420,
    });
  });

  it("returns useful defaults without mock school names when report rows are missing", () => {
    const payload = buildDashboardReportPayload({
      school: null,
      month: "2026-09",
      report: null,
      queries: [],
    });

    expect(payload.school.name).toBe("大学受験専門塾 iスクール予備校");
    expect(payload.report.schoolName).toBe("大学受験専門塾 iスクール予備校");
    expect(payload.report.aiComment).toContain("月次レポートデータをDBへ登録");
    expect(payload.queries).toEqual([]);
  });

  it("normalizes blank query logs and formats current month", () => {
    expect(normalizeQueryLogs([{ query: "  ", impressionCount: null }])).toEqual([
      {
        id: "query-1",
        query: "未設定キーワード",
        impressionCount: 0,
        clickCount: 0,
        growthRate: "0%",
        intent: "検索",
        count: 0,
      },
    ]);
    expect(getCurrentReportMonth(new Date("2026-09-04T00:00:00.000Z"))).toBe(
      "2026-09",
    );
  });

  it("maps low, middle, and excellent report scores into rank and metric tones", () => {
    const excellent = buildDashboardReportPayload({
      school: { id: "school-1", name: "iスクール予備校" },
      month: "2026-08",
      report: {
        targetMonth: "2026-08",
        averageRating: 3.5,
        top3RankingRate: 96,
        aioScore: 96,
        searchImpression: 0,
      },
      queries: null,
    });
    const middle = buildDashboardReportPayload({
      school: { id: "school-1", name: "iスクール予備校" },
      month: "2026-08",
      report: {
        targetMonth: "2026-08",
        averageRating: 5,
        top3RankingRate: 64,
        aioScore: 64,
      },
      queries: [],
    });
    const low = buildDashboardReportPayload({
      school: { id: "school-1", name: "iスクール予備校" },
      month: "2026/08",
      report: {
        targetMonth: "2026/08",
        top3RankingRate: 40,
        aioScore: 40,
      },
      queries: [],
    });

    expect(excellent.report.rank).toBe("S");
    expect(excellent.report.metrics[0].tone).toBe("watch");
    expect(excellent.report.metrics[2].tone).toBe("watch");
    expect(middle.report.rank).toBe("B");
    expect(low.report.rank).toBe("C");
    expect(low.report.period).toBe("2026/08");
  });

  it("builds a report record from operational aggregate values", () => {
    expect(
      buildReportFromAggregates({
        month: "2026-08",
        totalReviews: 2,
        averageRating: 5,
        top3KeywordCount: 3,
        totalKeywordCount: 4,
        aioScores: [80, 76],
        searchImpression: 2386,
        actionCount: 348,
      }),
    ).toMatchObject({
      targetMonth: "2026-08",
      totalReviews: 2,
      averageRating: 5,
      top3RankingRate: 75,
      aioScore: 78,
      searchImpression: 2386,
      actionCount: 348,
    });
  });

  it("returns null when there is no aggregate data to report", () => {
    expect(
      buildReportFromAggregates({
        month: "2026-08",
        totalReviews: 0,
        averageRating: 0,
        top3KeywordCount: 0,
        totalKeywordCount: 0,
        aioScores: [],
        searchImpression: 0,
        actionCount: 0,
      }),
    ).toBeNull();
  });
});
