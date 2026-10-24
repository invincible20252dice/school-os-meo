import { normalizeMonthlyReportData } from "@/lib/mock/reportData";

export const DEFAULT_REPORT_SCHOOL_ID = "cms5tnzlr0001jt04qh0lluva";
export const DEFAULT_REPORT_SCHOOL_NAME = "大学受験専門塾 iスクール予備校";

export type ReportField = "totalReviews" | "averageRating" | "top3RankingRate" | "aioScore" | "searchImpression" | "actionCount";
export type ReportAvailability = Record<ReportField, boolean>;
export type ReportProvenance = { source: "stored" | "aggregate"; measurement: "unverified"; available: ReportAvailability; evaluationInputsComplete: boolean };

export type DashboardReportRecord = {
  availableFields?: ReportAvailability;
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
  hasSourceRows?: boolean;
  month: string;
  totalReviews?: number | null;
  averageRating?: number | null;
  top3KeywordCount?: number | null;
  totalKeywordCount?: number | null;
  aioScores?: number[] | null;
  searchImpression?: number | null;
  actionCount?: number | null;
};

function trim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

  if (!hasAggregatedData && !input.hasSourceRows) {
    return null;
  }

  return {
    availableFields: {
      totalReviews: isNumber(input.totalReviews), averageRating: isNumber(input.averageRating),
      top3RankingRate: totalKeywordCount > 0 && isNumber(input.top3KeywordCount),
      aioScore: (input.aioScores ?? []).some(isNumber),
      searchImpression: isNumber(input.searchImpression), actionCount: isNumber(input.actionCount),
    },
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
  source = "stored",
}: {
  school?: DashboardReportSchoolRecord | null;
  report?: DashboardReportRecord | null;
  queries?: DashboardQueryLogRecord[] | null;
  month: string;
  source?: ReportProvenance["source"];
}) {
  const schoolName = trim(school?.name) || "校舎名未取得";
  if (!report) return { school: { id: trim(school?.id), name: schoolName }, targetMonth: month, report: null, queries: normalizeQueryLogs(queries ?? []) };
  const available: ReportAvailability = report.availableFields ?? {
    totalReviews: isNumber(report.totalReviews), averageRating: isNumber(report.averageRating),
    top3RankingRate: isNumber(report.top3RankingRate), aioScore: isNumber(report.aioScore),
    searchImpression: isNumber(report.searchImpression), actionCount: isNumber(report.actionCount),
  };
  const provenance: ReportProvenance = { source, measurement: "unverified", available,
    evaluationInputsComplete: available.top3RankingRate && available.aioScore && available.averageRating };
  const display = (field: ReportField, formatted: string) => available[field] ? formatted : "未取得";
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
    monthOverMonth: "比較未取得",
    aiComment: aiAnalysisSummary,
    metrics: [
      {
        label: "登録口コミ数・平均評価",
        value: `${display("totalReviews", `${totalReviews}件`)} / ${display("averageRating", formatRating(averageRating))}`,
        detail: "登録された口コミの件数と平均評価",
        trend: "DB登録値",
        tone: averageRating >= 4 ? "good" : "watch",
      },
      {
        label: "MEO順位",
        value: display("top3RankingRate", `Top3率 ${Math.round(top3RankingRate)}%`),
        detail: "登録キーワードの上位表示率（最新順位・対象月外を含む場合があります）",
        trend: "順位ログ連動",
        tone: top3RankingRate >= 70 ? "good" : "watch",
      },
      {
        label: "GBP検索表示",
        value: display("searchImpression", `${searchImpression.toLocaleString("ja-JP")}回`),
        detail: `保存アクション数 ${display("actionCount", `${actionCount.toLocaleString("ja-JP")}件`)}（未取得項目を含む場合があります）`,
        trend: "流入語句ログ連動",
        tone: searchImpression > 0 ? "good" : "watch",
      },
      {
        label: "AIO旧方式の保存スコア",
        value: display("aioScore", `${aioScore}/100`),
        detail: "旧方式の保存値です。新しい実測AIOの結果ではありません。",
        trend: "AIO履歴連動",
        tone: aioScore >= 70 ? "good" : "watch",
      },
    ],
    actions: [],
  });

  return {
    school: {
      id: trim(school?.id),
      name: schoolName,
    },
    targetMonth,
    report: {
      ...monthlyReport,
      provenance,
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
