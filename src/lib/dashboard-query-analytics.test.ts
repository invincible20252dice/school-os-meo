import { describe, expect, it } from "vitest";
import {
  buildQueryAdvice,
  buildQueryAnalyticsPayload,
  buildQueryAnalyticsSummary,
  buildQueryCategorySummary,
  normalizeSearchQueryLogs,
} from "./dashboard-query-analytics";

describe("dashboard-query-analytics", () => {
  it("normalizes search query logs with CTR and inferred categories", () => {
    const queries = normalizeSearchQueryLogs([
      {
        id: "query-1",
        schoolId: "school-1",
        targetMonth: "2026-08",
        query: "熊本 大学受験 塾",
        impressionCount: 420,
        clickCount: 58,
        growthRate: "+24%",
      },
      {
        query: " 塾 月謝 比較 ",
        impressionCount: 100,
        clickCount: 3,
      },
    ]);

    expect(queries).toEqual([
      expect.objectContaining({
        id: "query-1",
        query: "熊本 大学受験 塾",
        impressionCount: 420,
        clickCount: 58,
        ctr: "13.8%",
        growthRate: "+24%",
        intent: "学年",
      }),
      expect.objectContaining({
        id: "query-2",
        query: "塾 月謝 比較",
        ctr: "3.0%",
        growthRate: "0%",
        intent: "料金",
      }),
    ]);
  });

  it("builds summary and category totals from normalized queries", () => {
    const queries = normalizeSearchQueryLogs([
      {
        query: "熊本 個別指導 おすすめ",
        impressionCount: 280,
        clickCount: 31,
        intent: "評判",
      },
      {
        query: "中央区 塾 評判",
        impressionCount: 220,
        clickCount: 11,
        intent: "評判",
      },
    ]);

    expect(buildQueryAnalyticsSummary(queries)).toEqual({
      totalQueries: 2,
      totalImpressions: 500,
      totalClicks: 42,
      avgCtr: "8.4%",
    });
    expect(buildQueryCategorySummary(queries)).toEqual([
      {
        intent: "評判",
        queryCount: 2,
        impressionCount: 500,
        clickCount: 42,
        ctr: "8.4%",
      },
    ]);
  });

  it("generates improvement advice from top queries and low CTR rows", () => {
    const queries = normalizeSearchQueryLogs([
      {
        query: "熊本 大学受験 塾",
        impressionCount: 420,
        clickCount: 58,
        intent: "学年",
      },
      {
        query: "通町筋 予備校",
        impressionCount: 310,
        clickCount: 5,
        intent: "地域",
      },
    ]);

    expect(buildQueryAdvice(queries)).toEqual([
      expect.stringContaining("熊本 大学受験 塾"),
      expect.stringContaining("学年カテゴリ"),
      expect.stringContaining("通町筋 予備校"),
    ]);
  });

  it("returns an empty-state advice when no query logs exist", () => {
    expect(buildQueryAnalyticsPayload({
      schoolId: "school-1",
      month: "2026-08",
      logs: [],
    })).toMatchObject({
      schoolId: "school-1",
      targetMonth: "2026-08",
      summary: {
        totalQueries: 0,
        totalImpressions: 0,
        totalClicks: 0,
        avgCtr: "0.0%",
      },
      categories: [],
      advice: [expect.stringContaining("SearchQueryLog")],
      queries: [],
    });
  });

  it("infers query categories and zero CTR from real search wording", () => {
    const queries = normalizeSearchQueryLogs([
      {
        query: "夏期講習 熊本",
        impressionCount: 0,
        clickCount: 5,
      },
      {
        query: "中央区 塾 評判",
        impressionCount: 120,
        clickCount: 12,
      },
      {
        query: "通町筋 予備校",
        impressionCount: 80,
        clickCount: 8,
      },
    ]);

    expect(queries).toEqual([
      expect.objectContaining({
        query: "夏期講習 熊本",
        ctr: "0.0%",
        intent: "講習",
      }),
      expect.objectContaining({
        query: "中央区 塾 評判",
        intent: "評判",
      }),
      expect.objectContaining({
        query: "通町筋 予備校",
        intent: "地域",
      }),
    ]);
  });

  it("keeps saved intent and normalizes invalid numeric values", () => {
    const queries = normalizeSearchQueryLogs([
      {
        id: "",
        schoolId: " school-1 ",
        targetMonth: " 2026-08 ",
        query: null,
        impressionCount: Number.NaN,
        clickCount: -2,
        growthRate: "",
        intent: "指名",
      },
    ]);

    expect(queries[0]).toEqual({
      id: "query-1",
      schoolId: "school-1",
      targetMonth: "2026-08",
      query: "未設定キーワード",
      impressionCount: 0,
      clickCount: 0,
      ctr: "0.0%",
      growthRate: "0%",
      intent: "指名",
    });
  });

  it("returns zero CTR for empty categories", () => {
    expect(
      buildQueryCategorySummary([
        {
          id: "query-1",
          schoolId: "school-1",
          targetMonth: "2026-08",
          query: "未計測",
          impressionCount: 0,
          clickCount: 0,
          ctr: "0.0%",
          growthRate: "0%",
          intent: "地域",
        },
      ]),
    ).toEqual([
      {
        intent: "地域",
        queryCount: 1,
        impressionCount: 0,
        clickCount: 0,
        ctr: "0.0%",
      },
    ]);
  });
});
