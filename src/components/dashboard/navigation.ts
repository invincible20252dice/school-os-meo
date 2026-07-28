export type DashboardNavItem = {
  label: string;
  href: string;
  icon: "dashboard" | "survey" | "review" | "ranking" | "aio" | "instagram" | "report" | "settings";
  children?: Array<{
    label: string;
    href: string;
  }>;
};

export const dashboardNavItems: DashboardNavItem[] = [
  {
    label: "ダッシュボード",
    href: "/dashboard",
    icon: "dashboard",
    children: [
      { label: "概要", href: "/dashboard" },
      { label: "成果ROI", href: "/dashboard/roi" },
    ],
  },
  {
    label: "アンケート設定",
    href: "/dashboard/surveys",
    icon: "survey",
    children: [
      { label: "一覧", href: "/dashboard/surveys" },
      { label: "新規作成・編集", href: "/dashboard/surveys/new" },
    ],
  },
  {
    label: "口コミ一覧・返信",
    href: "/dashboard/reviews",
    icon: "review",
    children: [
      { label: "口コミ一覧", href: "/dashboard/reviews" },
      { label: "AI分析", href: "/dashboard/reviews/analytics" },
      { label: "退塾防止アラート", href: "/dashboard/reviews/alerts" },
    ],
  },
  {
    label: "キーワードランキング",
    href: "/dashboard/rankings",
    icon: "ranking",
    children: [
      { label: "順位計測", href: "/dashboard/rankings" },
      { label: "時間帯別順位", href: "/dashboard/keywords" },
      { label: "検索需要チェック", href: "/dashboard/keywords/volume" },
      { label: "競合校区分析", href: "/dashboard/keywords/competitors" },
    ],
  },
  {
    label: "AIOスコア分析",
    href: "/dashboard/aio",
    icon: "aio",
    children: [
      { label: "AIOスコア分析", href: "/dashboard/aio" },
      { label: "旧スコア可視化", href: "/dashboard/aio-score" },
    ],
  },
  {
    label: "Instagram連携設定",
    href: "/dashboard/instagram",
    icon: "instagram",
    children: [
      { label: "連携設定", href: "/dashboard/instagram" },
      { label: "実績マルチ投稿", href: "/dashboard/posts/results" },
    ],
  },
  {
    label: "診断レポート",
    href: "/dashboard/report",
    icon: "report",
    children: [
      { label: "月次レポート", href: "/dashboard/report" },
      { label: "流入語句分析", href: "/dashboard/analytics/queries" },
    ],
  },
  {
    label: "設定",
    href: "/dashboard/settings",
    icon: "settings",
    children: [
      { label: "Googleアカウント連携", href: "/dashboard/settings/google" },
      { label: "LINE通知設定", href: "/dashboard/settings/line" },
      { label: "Instagram連携設定", href: "/dashboard/settings/instagram" },
      { label: "プロンプト設定", href: "/dashboard/settings/prompts" },
      { label: "ユーザー・権限管理", href: "/dashboard/settings/users" },
      { label: "改ざん防止", href: "/dashboard/settings/protection" },
    ],
  },
];
