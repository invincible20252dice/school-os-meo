export type OverviewRecords = {
  reviews: Array<{ rating: number | null; status: string; repliedAt: Date | null; postedAt: Date | null; createdAt: Date }>;
  keywords: Array<{
    id: string; keyword: string; schoolId: string;
    rankHistories: Array<{ rank: number | null; checkedAt: Date }>;
    aioScoreHistories: Array<{ chatgptScore: number; geminiScore: number; googleAiScore: number; totalScore: number; checkedAt: Date }>;
  }>;
  queries: Array<{ query: string; targetMonth: string; impressionCount: number }>;
  alerts: Array<{ status: string; riskLevel: string }>;
};

function mean(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null;
}

export function buildDashboardOverview(records: OverviewRecords, now: Date) {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1, -9));
  const previousStart = new Date(Date.UTC(year, month - 1, 1, -9));
  const end = new Date(Date.UTC(year, month + 1, 1, -9));
  const dates = records.reviews.map(review => review.postedAt ?? review.createdAt);
  const monthlyCount = dates.filter(date => date >= start && date < end).length;
  const previousCount = dates.filter(date => date >= previousStart && date < start).length;
  const ratings = records.reviews.map(review => review.rating).filter((rating): rating is number => rating !== null && rating >= 1 && rating <= 5);
  const pendingCount = records.reviews.filter(review => !review.repliedAt && ["PENDING", "PENDING_CUSTOM_REPLY"].includes(review.status)).length;

  // Each keyword contributes only its most recent measurement, never historical duplicates.
  const measured = records.keywords.filter(keyword => keyword.rankHistories.length > 0)
    .sort((a, b) => b.rankHistories[0].checkedAt.getTime() - a.rankHistories[0].checkedAt.getTime() || a.id.localeCompare(b.id));
  const primary = measured[0];
  const latest = primary?.rankHistories[0];
  const previous = primary?.rankHistories[1];
  const aio = records.keywords.flatMap(keyword => keyword.aioScoreHistories.slice(0, 1));
  const queryMonth = records.queries.map(query => query.targetMonth).sort().at(-1) ?? null;
  const totals = new Map<string, number>();
  for (const query of records.queries) {
    if (query.targetMonth === queryMonth) totals.set(query.query, (totals.get(query.query) ?? 0) + query.impressionCount);
  }
  const topQuery = [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const openCount = records.alerts.filter(alert => alert.status === "OPEN").length;
  const inProgressCount = records.alerts.filter(alert => alert.status === "IN_PROGRESS").length;
  const highRiskCount = records.alerts.filter(alert => ["OPEN", "IN_PROGRESS"].includes(alert.status) && alert.riskLevel === "HIGH").length;
  const actions: Array<{ text: string; path: string }> = [];
  if (pendingCount) actions.push({ text: `未返信口コミ${pendingCount}件の返信案を確認してください。`, path: "/dashboard/reviews" });
  if (openCount) actions.push({ text: `未対応の退塾防止アラート${openCount}件を確認してください。`, path: "/dashboard/churn-alert" });
  if (inProgressCount) actions.push({ text: `対応中の退塾防止アラート${inProgressCount}件の進捗を確認してください。`, path: "/dashboard/churn-alert" });
  if (primary && (latest.rank === null || latest.rank > 3)) actions.push({ text: `「${primary.keyword}」の最新順位と競合状況を確認してください。`, path: "/dashboard/rankings" });
  return {
    month: `${year}-${String(month + 1).padStart(2, "0")}`,
    reviews: { count: records.reviews.length, rating: mean(ratings), monthlyCount, previousCount, difference: monthlyCount - previousCount },
    meo: latest ? { keyword: primary.keyword, schoolId: primary.schoolId, rank: latest.rank, previousRank: previous?.rank ?? null,
      difference: latest.rank !== null && previous?.rank != null ? previous.rank - latest.rank : null, measuredAt: latest.checkedAt.toISOString() } : null,
    aio: aio.length ? { score: mean(aio.map(item => item.totalScore)), chatGpt: mean(aio.map(item => item.chatgptScore)), gemini: mean(aio.map(item => item.geminiScore)), googleAi: mean(aio.map(item => item.googleAiScore)), keywordCount: aio.length } : null,
    topQuery: topQuery ? { query: topQuery[0], impressionCount: topQuery[1], month: queryMonth } : null,
    pendingCount,
    churn: { openCount, inProgressCount, highRiskCount },
    actions,
  };
}

export type DashboardOverview = {
  schoolId: string | null; schoolName: string; schoolCount: number; generatedAt: string;
  summary: ReturnType<typeof buildDashboardOverview>;
};
