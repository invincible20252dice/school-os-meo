import { normalizeMonthlyReportData } from "@/lib/mock/reportData";

export const DEFAULT_REPORT_SCHOOL_ID = "cms5tnzlr0001jt04qh0lluva";
export const DEFAULT_REPORT_SCHOOL_NAME = "大学受験専門塾 iスクール予備校";

export type DashboardReportRecord = {
  targetMonth?: string | null;
  totalReviews?: number | null;
  averageRating?: number | null;
  top3RankingRate?: number | null;
  aioScore?: number | null;
  searchImpression?: number | null;
  actionCount?: number | null;
  aiAnalysisSummary?: string | null;
  updatedAt?: Date | string | null;
};

export type DashboardQueryLogRecord = {
  id?: string | null;
  query?: string | null;
  impressionCount?: number | null;
  clickCount?: number | null;
  growthRate?: string | null;
  intent?: string | null;
};

export type DashboardReportSchoolRecord = {
  id?: string | null;
  name?: string | null;
};

export type DashboardReportAggregateInput = {
  month: string;
  totalReviews?: number | null;
  averageRating?: number | null;
  top3KeywordCount?: number | null;
  totalKeywordCount?: number | null;
  aioScores?: number[] | null;
  searchImpression?: number | null;
  actionCount?: number | null;
};

export const ISCHOOL_REPORT_BASELINE: DashboardReportRecord = {
  targetMonth: "2026-08",
  totalReviews: 2,
  averageRating: 5,
  top3RankingRate: 85,
  aioScore: 78,
  searchImpression: 2386,
  actionCount: 348,
  aiAnalysisSummary:
    "「大学受験」「個別指導」関連の検索露出が先月比+92.4%と急拡大。下通エリアでの上位表示と高評価口コミ（★5.0）が成果に直結しています。",
};

function trim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-");

  return year && monthNumber ? `${year}年${Number(monthNumber)}月度` : month;
}

function formatRating(value: number) {
  return value.toLocaleString("ja-JP", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function rankFromScore(score: number) {
  if (score >= 90) {
    return "S" as const;
  }

  if (score >= 75) {
    return "A" as const;
  }

  if (score >= 60) {
    return "B" as const;
  }

  return "C" as const;
}

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function average(values: number[]) {
  const validValues = values.filter((value) => Number.isFinite(value));

  if (validValues.length === 0) {
    return 0;
  }

  return Math.round(
    validValues.reduce((sum, value) => sum + value, 0) / validValues.length,
  );
}

function calculateOverallScore({
  top3RankingRate,
  aioScore,
  averageRating,
}: {
  top3RankingRate: number;
  aioScore: number;
  averageRating: number;
}) {
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(top3RankingRate * 0.4 + aioScore * 0.4 + averageRating * 4),
    ),
  );
}

export function getCurrentReportMonth(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

export function normalizeQueryLogs(logs: DashboardQueryLogRecord[] = []) {
  return logs.map((log, index) => ({
    id: trim(log.id) || `query-${index + 1}`,
    query: trim(log.query) || "未設定キーワード",
    impressionCount: numberValue(log.impressionCount),
    clickCount: numberValue(log.clickCount),
    growthRate: trim(log.growthRate) || "0%",
    intent: trim(log.intent) || "検索",
    count: numberValue(log.impressionCount),
  }));
}

export function buildReportFromAggregates(
  input: DashboardReportAggregateInput,
): DashboardReportRecord | null {
  const totalReviews = numberValue(input.totalReviews);
  const averageRating = numberValue(input.averageRating);
  const totalKeywordCount = numberValue(input.totalKeywordCount);
  const top3RankingRate = percent(
    numberValue(input.top3KeywordCount),
    totalKeywordCount,
  );
  const aioScore = average(input.aioScores ?? []);
  const searchImpression = numberValue(input.searchImpression);
  const actionCount = numberValue(input.actionCount);
  const hasAggregatedData =
    totalReviews > 0 ||
    totalKeywordCount > 0 ||
    aioScore > 0 ||
    searchImpression > 0 ||
    actionCount > 0;

  if (!hasAggregatedData) {
    return null;
  }

  return {
    targetMonth: input.month,
    totalReviews,
    averageRating,
    top3RankingRate,
    aioScore,
    searchImpression,
    actionCount,
    aiAnalysisSummary:
      "DB内の口コミ・順位・AIO・GBP指標から月次KPIを自動集計しています。",
  };
}

export function buildDashboardReportPayload({
  school,
  report,
  queries,
  month,
}: {
  school?: DashboardReportSchoolRecord | null;
  report?: DashboardReportRecord | null;
  queries?: DashboardQueryLogRecord[] | null;
  month: string;
}) {
  const schoolName = trim(school?.name) || DEFAULT_REPORT_SCHOOL_NAME;
  const targetMonth = trim(report?.targetMonth) || month;
  const totalReviews = numberValue(report?.totalReviews, 0);
  const averageRating = numberValue(report?.averageRating, 0);
  const top3RankingRate = numberValue(report?.top3RankingRate, 0);
  const aioScore = numberValue(report?.aioScore, 0);
  const searchImpression = numberValue(report?.searchImpression, 0);
  const actionCount = numberValue(report?.actionCount, 0);
  const score = calculateOverallScore({
    top3RankingRate,
    aioScore,
    averageRating,
  });
  const normalizedQueries = normalizeQueryLogs(queries ?? []);
  const aiAnalysisSummary =
    trim(report?.aiAnalysisSummary) ||
    "月次レポートデータをDBへ登録すると、校舎ごとの成果要約がここに表示されます。";

  const monthlyReport = normalizeMonthlyReportData({
    schoolName,
    period: formatMonth(targetMonth),
    score,
    rank: rankFromScore(score),
    monthOverMonth: "DB集計",
    aiComment: aiAnalysisSummary,
    metrics: [
      {
        label: "口コミ獲得・返信率",
        value: `${totalReviews}件 / ${formatRating(averageRating)}`,
        detail: `平均評価 ${formatRating(averageRating)} / 5.0`,
        trend: "本番DB集計",
        tone: averageRating >= 4 ? "good" : "watch",
      },
      {
        label: "MEO順位",
        value: `Top3率 ${Math.round(top3RankingRate)}%`,
        detail: "登録キーワードの上位表示率",
        trend: "順位ログ連動",
        tone: top3RankingRate >= 70 ? "good" : "watch",
      },
      {
        label: "GBP検索表示",
        value: `${searchImpression.toLocaleString("ja-JP")}回`,
        detail: `アクション数 ${actionCount.toLocaleString("ja-JP")}件`,
        trend: "流入語句ログ連動",
        tone: searchImpression > 0 ? "good" : "watch",
      },
      {
        label: "AIOスコア",
        value: `${aioScore}/100`,
        detail: "AI検索での推奨度・言及率",
        trend: "AIO履歴連動",
        tone: aioScore >= 70 ? "good" : "watch",
      },
    ],
    actions: [
      {
        title: "検索露出の高い語句をGBP投稿に反映",
        detail:
          normalizedQueries[0]?.query
            ? `「${normalizedQueries[0].query}」を次回投稿・口コミ依頼文に自然に含めます。`
            : "検索クエリログを蓄積し、露出が伸びている語句を投稿へ反映します。",
        owner: "MEO担当",
      },
      {
        title: "口コミ返信とアンケート導線を継続運用",
        detail: "高評価口コミの獲得と返信品質を維持し、月次レポートへ成果を反映します。",
        owner: "教室長",
      },
      {
        title: "AIO強化キーワードを校舎ページへ追加",
        detail: "AI検索に拾われやすい校舎特徴・地域語句を公式情報へ追記します。",
        owner: "コンテンツ担当",
      },
    ],
  });

  return {
    school: {
      id: trim(school?.id),
      name: schoolName,
    },
    targetMonth,
    report: {
      ...monthlyReport,
      raw: {
        targetMonth,
        totalReviews,
        averageRating,
        top3RankingRate,
        aioScore,
        searchImpression,
        actionCount,
        aiAnalysisSummary,
        updatedAt: report?.updatedAt ?? null,
      },
    },
    queries: normalizedQueries,
  };
}
