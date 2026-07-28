export type OwnerDashboardSummary = {
  schoolName: string;
  user: {
    name: string;
    role: string;
  };
  review: {
    monthlyCount: number;
    averageRating: number;
    stars: string;
    changeLabel: string;
  };
  ranking: {
    keyword: string;
    rank: number;
    previousRank: number;
    changeLabel: string;
  };
  aio: {
    averageScore: number;
    chatgptScore: number;
    geminiScore: number;
    googleAiScore: number;
  };
  unrepliedReviews: {
    count: number;
    href: string;
  };
  actions: string[];
};

export type NullableOwnerDashboardSummary = {
  schoolName?: string | null;
  user?: Partial<OwnerDashboardSummary["user"]> | null;
  review?: Partial<OwnerDashboardSummary["review"]> | null;
  ranking?: Partial<OwnerDashboardSummary["ranking"]> | null;
  aio?: Partial<OwnerDashboardSummary["aio"]> | null;
  unrepliedReviews?: Partial<OwnerDashboardSummary["unrepliedReviews"]> | null;
  actions?: Array<string | null | undefined> | null;
};

export function buildOwnerDashboardSummary(): OwnerDashboardSummary {
  return {
    schoolName: "青葉ゼミナール 本校",
    user: {
      name: "佐藤 教室長",
      role: "Owner",
    },
    review: {
      monthlyCount: 28,
      averageRating: 4.7,
      stars: "★★★★☆",
      changeLabel: "+6件 / 前月比",
    },
    ranking: {
      keyword: "横浜駅 個別指導 塾",
      rank: 3,
      previousRank: 4,
      changeLabel: "+1",
    },
    aio: {
      averageScore: 47,
      chatgptScore: 100,
      geminiScore: 0,
      googleAiScore: 40,
    },
    unrepliedReviews: {
      count: 3,
      href: "/dashboard/reviews",
    },
    actions: [
      "未返信口コミ3件へAI返信案を確認して返信してください。",
      "GeminiでのAIO表示率改善のため、GBPの講習情報を更新してください。",
      "横浜駅周辺キーワードの3位維持に向け、競合上位2校の口コミ増加を確認してください。",
    ],
  };
}

function normalizeString(value: string | null | undefined, fallback: string) {
  return value?.trim() ? value : fallback;
}

function normalizeNumber(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

export function normalizeOwnerDashboardSummary(
  summary: NullableOwnerDashboardSummary = {},
): OwnerDashboardSummary {
  const fallback = buildOwnerDashboardSummary();
  const actions = summary.actions
    ?.filter((action): action is string => Boolean(action?.trim()));

  return {
    schoolName: normalizeString(summary.schoolName, fallback.schoolName),
    user: {
      name: normalizeString(summary.user?.name, fallback.user.name),
      role: normalizeString(summary.user?.role, fallback.user.role),
    },
    review: {
      monthlyCount: normalizeNumber(
        summary.review?.monthlyCount,
        fallback.review.monthlyCount,
      ),
      averageRating: normalizeNumber(
        summary.review?.averageRating,
        fallback.review.averageRating,
      ),
      stars: normalizeString(summary.review?.stars, fallback.review.stars),
      changeLabel: normalizeString(
        summary.review?.changeLabel,
        fallback.review.changeLabel,
      ),
    },
    ranking: {
      keyword: normalizeString(
        summary.ranking?.keyword,
        fallback.ranking.keyword,
      ),
      rank: normalizeNumber(summary.ranking?.rank, fallback.ranking.rank),
      previousRank: normalizeNumber(
        summary.ranking?.previousRank,
        fallback.ranking.previousRank,
      ),
      changeLabel: normalizeString(
        summary.ranking?.changeLabel,
        fallback.ranking.changeLabel,
      ),
    },
    aio: {
      averageScore: normalizeNumber(
        summary.aio?.averageScore,
        fallback.aio.averageScore,
      ),
      chatgptScore: normalizeNumber(
        summary.aio?.chatgptScore,
        fallback.aio.chatgptScore,
      ),
      geminiScore: normalizeNumber(
        summary.aio?.geminiScore,
        fallback.aio.geminiScore,
      ),
      googleAiScore: normalizeNumber(
        summary.aio?.googleAiScore,
        fallback.aio.googleAiScore,
      ),
    },
    unrepliedReviews: {
      count: normalizeNumber(
        summary.unrepliedReviews?.count,
        fallback.unrepliedReviews.count,
      ),
      href: normalizeString(
        summary.unrepliedReviews?.href,
        fallback.unrepliedReviews.href,
      ),
    },
    actions: actions ?? fallback.actions,
  };
}
