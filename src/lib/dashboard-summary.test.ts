import { describe, expect, it } from "vitest";
import {
  buildOwnerDashboardSummary,
  normalizeOwnerDashboardSummary,
} from "./dashboard-summary";

describe("dashboard-summary", () => {
  it("builds the owner dashboard summary cards and alert", () => {
    const summary = buildOwnerDashboardSummary();

    expect(summary.review.monthlyCount).toBeGreaterThan(0);
    expect(summary.review.averageRating).toBe(4.7);
    expect(summary.ranking.keyword).toBe("横浜駅 個別指導 塾");
    expect(summary.aio.averageScore).toBe(47);
    expect(summary.unrepliedReviews.count).toBe(3);
    expect(summary.unrepliedReviews.href).toBe("/dashboard/reviews");
    expect(summary.actions).toHaveLength(3);
  });

  it("normalizes nullable dashboard data for safe rendering", () => {
    const summary = normalizeOwnerDashboardSummary({
      schoolName: null,
      user: null,
      review: {
        monthlyCount: null,
        averageRating: Number.NaN,
        stars: null,
      },
      ranking: null,
      aio: {
        averageScore: undefined,
        chatgptScore: null,
      },
      unrepliedReviews: {
        count: null,
        href: "",
      },
      actions: null,
    });

    expect(summary.schoolName).toBe("青葉ゼミナール 本校");
    expect(summary.user.name).toBe("佐藤 教室長");
    expect(summary.review.monthlyCount).toBe(28);
    expect(summary.review.averageRating).toBe(4.7);
    expect(summary.review.stars).toBe("★★★★☆");
    expect(summary.ranking.keyword).toBe("横浜駅 個別指導 塾");
    expect(summary.aio.averageScore).toBe(47);
    expect(summary.unrepliedReviews.href).toBe("/dashboard/reviews");
    expect(summary.actions).toHaveLength(3);
  });

  it("keeps an intentionally empty action list", () => {
    const summary = normalizeOwnerDashboardSummary({ actions: [] });

    expect(summary.actions).toEqual([]);
  });

  it("removes empty action items before rendering", () => {
    const summary = normalizeOwnerDashboardSummary({
      actions: ["口コミ返信を確認", null, "", undefined, "GBP投稿を確認"],
    });

    expect(summary.actions).toEqual(["口コミ返信を確認", "GBP投稿を確認"]);
  });

  it("keeps explicit dashboard values during normalization", () => {
    const summary = normalizeOwnerDashboardSummary({
      schoolName: "駅前校",
      user: { name: "山田", role: "manager" },
      review: {
        monthlyCount: 0,
        averageRating: 0,
        stars: "☆☆☆☆☆",
        changeLabel: "変化なし",
      },
      ranking: {
        keyword: "駅前 塾",
        rank: 0,
        previousRank: 0,
        changeLabel: "0",
      },
      aio: {
        averageScore: 0,
        chatgptScore: 0,
        geminiScore: 0,
        googleAiScore: 0,
      },
      unrepliedReviews: {
        count: 0,
        href: "/dashboard/reviews?school=station",
      },
      actions: ["対応なし"],
    });

    expect(summary.schoolName).toBe("駅前校");
    expect(summary.user).toEqual({ name: "山田", role: "manager" });
    expect(summary.review.monthlyCount).toBe(0);
    expect(summary.ranking.rank).toBe(0);
    expect(summary.aio.averageScore).toBe(0);
    expect(summary.unrepliedReviews.count).toBe(0);
    expect(summary.actions).toEqual(["対応なし"]);
  });
});
