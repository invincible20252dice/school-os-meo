import { describe, expect, it } from "vitest";
import {
  buildReviewAnalyticsData,
  normalizeReviewAnalyticsData,
} from "./reviewAnalyticsData";

describe("review analytics mock data", () => {
  it("builds language tabs and school-focused opinion categories", () => {
    const analytics = normalizeReviewAnalyticsData(buildReviewAnalyticsData());

    expect(analytics.tabs).toEqual([
      { key: "all", label: "全体", count: 128 },
      { key: "ja", label: "日本語", count: 116 },
      { key: "en", label: "英語", count: 12 },
    ]);
    expect(analytics.opinions.map((opinion) => opinion.label)).toContain(
      "指導が丁寧で親切",
    );
    expect(analytics.opinions.map((opinion) => opinion.category)).toContain(
      "教室環境",
    );
  });

  it("calculates sentiment totals and percentages", () => {
    const analytics = normalizeReviewAnalyticsData({
      tabs: [{ key: "all", label: "全体", count: 10 }],
      opinions: [
        {
          id: "good",
          label: "良い",
          category: "指導品質",
          sentiment: "positive",
          count: 6,
        },
        {
          id: "neutral",
          label: "普通",
          category: "運営対応",
          sentiment: "neutral",
          count: 3,
        },
        {
          id: "bad",
          label: "悪い",
          category: "連絡対応",
          sentiment: "negative",
          count: 1,
        },
      ],
    });

    expect(analytics.sentiment).toEqual({
      total: 10,
      positive: 6,
      neutral: 3,
      negative: 1,
      positivePercentage: 60,
      neutralPercentage: 30,
      negativePercentage: 10,
    });
    expect(analytics.opinions.map((opinion) => opinion.percentage)).toEqual([
      60, 30, 10,
    ]);
  });

  it("keeps an empty dataset renderable", () => {
    const analytics = normalizeReviewAnalyticsData({
      tabs: [{ key: "all", label: "全体", count: -1 }],
      opinions: [],
    });

    expect(analytics.tabs).toEqual([{ key: "all", label: "全体", count: 0 }]);
    expect(analytics.opinions).toEqual([]);
    expect(analytics.sentiment).toEqual({
      total: 0,
      positive: 0,
      neutral: 0,
      negative: 0,
      positivePercentage: 0,
      neutralPercentage: 0,
      negativePercentage: 0,
    });
  });

  it("falls back tabs and normalizes invalid counts and sentiment values", () => {
    const analytics = normalizeReviewAnalyticsData({
      tabs: [],
      opinions: [
        {
          id: "invalid",
          label: "未分類",
          category: "その他",
          sentiment: "mixed" as never,
          count: Number.NaN,
        },
        {
          id: "rounded",
          label: "良い",
          category: "指導品質",
          sentiment: "positive",
          count: 2.4,
        },
      ],
    });

    expect(analytics.tabs.map((tab) => tab.label)).toEqual([
      "全体",
      "日本語",
      "英語",
    ]);
    expect(analytics.opinions).toEqual([
      {
        id: "invalid",
        label: "未分類",
        category: "その他",
        sentiment: "neutral",
        count: 0,
        percentage: 0,
      },
      {
        id: "rounded",
        label: "良い",
        category: "指導品質",
        sentiment: "positive",
        count: 2,
        percentage: 100,
      },
    ]);
  });
});
