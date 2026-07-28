import { describe, expect, it } from "vitest";
import { dashboardNavItems } from "./navigation";

describe("dashboard navigation", () => {
  it("contains the required owner dashboard menu structure", () => {
    expect(dashboardNavItems.map((item) => item.href)).toEqual([
      "/dashboard",
      "/dashboard/surveys",
      "/dashboard/reviews",
      "/dashboard/rankings",
      "/dashboard/aio",
      "/dashboard/instagram",
      "/dashboard/report",
      "/dashboard/settings",
    ]);
  });

  it("contains hierarchical survey and settings items", () => {
    expect(
      dashboardNavItems.find((item) => item.href === "/dashboard")?.children,
    ).toEqual([
      { label: "概要", href: "/dashboard" },
      { label: "成果ROI", href: "/dashboard/roi" },
    ]);
    expect(
      dashboardNavItems.find((item) => item.href === "/dashboard/surveys")
        ?.children,
    ).toEqual([
      { label: "一覧", href: "/dashboard/surveys" },
      { label: "新規作成・編集", href: "/dashboard/surveys/new" },
    ]);
    expect(
      dashboardNavItems.find((item) => item.href === "/dashboard/reviews")
        ?.children,
    ).toEqual([
      { label: "口コミ一覧", href: "/dashboard/reviews" },
      { label: "AI分析", href: "/dashboard/reviews/analytics" },
      { label: "退塾防止アラート", href: "/dashboard/reviews/alerts" },
    ]);
    expect(
      dashboardNavItems.find((item) => item.href === "/dashboard/rankings")
        ?.children,
    ).toEqual([
      { label: "順位計測", href: "/dashboard/rankings" },
      { label: "時間帯別順位", href: "/dashboard/keywords" },
      { label: "検索需要チェック", href: "/dashboard/keywords/volume" },
      { label: "競合校区分析", href: "/dashboard/keywords/competitors" },
    ]);
    expect(
      dashboardNavItems.find((item) => item.href === "/dashboard/instagram")
        ?.children,
    ).toEqual([
      { label: "連携設定", href: "/dashboard/instagram" },
      { label: "実績マルチ投稿", href: "/dashboard/posts/results" },
    ]);
    expect(
      dashboardNavItems.find((item) => item.href === "/dashboard/report")
        ?.children,
    ).toEqual([
      { label: "月次レポート", href: "/dashboard/report" },
      { label: "流入語句分析", href: "/dashboard/analytics/queries" },
    ]);
    expect(
      dashboardNavItems.find((item) => item.href === "/dashboard/settings")
        ?.children,
    ).toEqual([
      { label: "Googleアカウント連携", href: "/dashboard/settings/google" },
      { label: "LINE通知設定", href: "/dashboard/settings/line" },
      { label: "Instagram連携設定", href: "/dashboard/settings/instagram" },
      { label: "プロンプト設定", href: "/dashboard/settings/prompts" },
      { label: "ユーザー・権限管理", href: "/dashboard/settings/users" },
      { label: "改ざん防止", href: "/dashboard/settings/protection" },
    ]);
    expect(
      dashboardNavItems.find((item) => item.href === "/dashboard/aio")
        ?.children,
    ).toEqual([
      { label: "AIOスコア分析", href: "/dashboard/aio" },
      { label: "旧スコア可視化", href: "/dashboard/aio-score" },
    ]);
  });
});
