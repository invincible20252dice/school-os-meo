import { describe, expect, it } from "vitest";
import {
  buildInsightComparisonItems,
  buildMockInsightComparisonData,
  type InsightComparisonData,
} from "./insightData";

describe("insight comparison mock data", () => {
  it("builds the required eight GBP insight metrics", () => {
    const data = buildMockInsightComparisonData();
    const items = buildInsightComparisonItems(data);

    expect(data.period).toBe("過去30日間");
    expect(items).toHaveLength(8);
    expect(items.map((item) => item.label)).toEqual([
      "表示回数",
      "モバイル表示",
      "PC表示",
      "平均クリック率",
      "電話クリック数",
      "ルート検索回数",
      "ウェブサイトクリック数",
      "メニュー/詳細閲覧数",
    ]);
  });

  it("calculates count differences and rates from the initial value", () => {
    const [views] = buildInsightComparisonItems({
      period: "過去30日間",
      initialPeriod: "2025-04-07〜2025-05-06",
      recentPeriod: "2026-06-29〜2026-07-28",
      metrics: [
        {
          key: "views",
          label: "表示回数",
          unit: "回",
          valueType: "count",
          initial: 100,
          recent: 140,
        },
      ],
    });

    expect(views).toMatchObject({
      difference: 40,
      differenceRate: 40,
      trend: "increase",
      initialLabel: "100回",
      recentLabel: "140回",
      differenceLabel: "+40回",
      differenceRateLabel: "+40%",
    });
  });

  it("formats percentage metrics as point differences", () => {
    const [clickRate] = buildInsightComparisonItems({
      period: "過去30日間",
      initialPeriod: "2025-04-07〜2025-05-06",
      recentPeriod: "2026-06-29〜2026-07-28",
      metrics: [
        {
          key: "averageClickRate",
          label: "平均クリック率",
          unit: "%",
          valueType: "percent",
          initial: 4.6,
          recent: 6.4,
        },
      ],
    });

    expect(clickRate.trend).toBe("increase");
    expect(clickRate.initialLabel).toBe("4.6%");
    expect(clickRate.recentLabel).toBe("6.4%");
    expect(clickRate.differenceLabel).toBe("+1.8pt");
    expect(clickRate.differenceRateLabel).toBe("+39.1%");
  });

  it("marks decreases and avoids division by zero for new metrics", () => {
    const data: InsightComparisonData = {
      period: "過去30日間",
      initialPeriod: "2025-04-07〜2025-05-06",
      recentPeriod: "2026-06-29〜2026-07-28",
      metrics: [
        {
          key: "detailViews",
          label: "メニュー/詳細閲覧数",
          unit: "回",
          valueType: "count",
          initial: 20,
          recent: 12,
        },
        {
          key: "websiteClicks",
          label: "ウェブサイトクリック数",
          unit: "件",
          valueType: "count",
          initial: 0,
          recent: 7,
        },
      ],
    };

    const [detailViews, websiteClicks] = buildInsightComparisonItems(data);

    expect(detailViews).toMatchObject({
      difference: -8,
      differenceRate: -40,
      trend: "decrease",
      differenceLabel: "-8回",
      differenceRateLabel: "-40%",
    });
    expect(websiteClicks).toMatchObject({
      difference: 7,
      differenceRate: null,
      trend: "increase",
      differenceLabel: "+7件",
      differenceRateLabel: "初期値なし",
    });
  });

  it("marks unchanged values as flat", () => {
    const [item] = buildInsightComparisonItems({
      period: "過去30日間",
      initialPeriod: "2025-04-07〜2025-05-06",
      recentPeriod: "2026-06-29〜2026-07-28",
      metrics: [
        {
          key: "phoneClicks",
          label: "電話クリック数",
          unit: "件",
          valueType: "count",
          initial: 12,
          recent: 12,
        },
      ],
    });

    expect(item).toMatchObject({
      difference: 0,
      differenceRate: 0,
      trend: "flat",
      differenceLabel: "0件",
      differenceRateLabel: "0%",
    });
  });
});
