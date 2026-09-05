import { DEFAULT_REPORT_SCHOOL_ID } from "./dashboard-reports";

export const DEFAULT_QUERY_ANALYTICS_SCHOOL_ID = DEFAULT_REPORT_SCHOOL_ID;

export type SearchQueryLogSource = {
  id?: string | null;
  schoolId?: string | null;
  targetMonth?: string | null;
  query?: string | null;
  impressionCount?: number | null;
  clickCount?: number | null;
  growthRate?: string | null;
  intent?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

export type QueryAnalyticsItem = {
  id: string;
  schoolId: string;
  targetMonth: string;
  query: string;
  impressionCount: number;
  clickCount: number;
  ctr: string;
  growthRate: string;
  intent: string;
};

function trim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function inferIntent(query: string, intent?: string | null) {
  const savedIntent = trim(intent);

  if (savedIntent) {
    return savedIntent;
  }

  if (/料金|月謝|費用|価格|安い/.test(query)) {
    return "料金";
  }

  if (/評判|口コミ|レビュー|おすすめ/.test(query)) {
    return "評判";
  }

  if (/高校|中学|小学|受験|定期テスト|学年/.test(query)) {
    return "学年";
  }

  if (/講習|夏期|冬期|春期/.test(query)) {
    return "講習";
  }

  return "地域";
}

export function normalizeSearchQueryLogs(
  logs: SearchQueryLogSource[] = [],
): QueryAnalyticsItem[] {
  return logs.map((log, index) => {
    const impressionCount = numberValue(log.impressionCount);
    const clickCount = numberValue(log.clickCount);
    const ctr = impressionCount > 0 ? (clickCount / impressionCount) * 100 : 0;
    const query = trim(log.query) || "未設定キーワード";

    return {
      id: trim(log.id) || `query-${index + 1}`,
      schoolId: trim(log.schoolId),
      targetMonth: trim(log.targetMonth),
      query,
      impressionCount,
      clickCount,
      ctr: formatPercent(ctr),
      growthRate: trim(log.growthRate) || "0%",
      intent: inferIntent(query, log.intent),
    };
  });
}

export function buildQueryAnalyticsSummary(queries: QueryAnalyticsItem[] = []) {
  const totalImpressions = queries.reduce(
    (sum, query) => sum + query.impressionCount,
    0,
  );
  const totalClicks = queries.reduce((sum, query) => sum + query.clickCount, 0);
  const avgCtr =
    totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  return {
    totalQueries: queries.length,
    totalImpressions,
    totalClicks,
    avgCtr: formatPercent(avgCtr),
  };
}

export function buildQueryCategorySummary(queries: QueryAnalyticsItem[] = []) {
  const categories = new Map<
    string,
    { intent: string; queryCount: number; impressionCount: number; clickCount: number }
  >();

  for (const query of queries) {
    const current =
      categories.get(query.intent) || {
        intent: query.intent,
        queryCount: 0,
        impressionCount: 0,
        clickCount: 0,
      };

    current.queryCount += 1;
    current.impressionCount += query.impressionCount;
    current.clickCount += query.clickCount;
    categories.set(query.intent, current);
  }

  return Array.from(categories.values())
    .map((category) => ({
      ...category,
      ctr:
        category.impressionCount > 0
          ? formatPercent((category.clickCount / category.impressionCount) * 100)
          : "0.0%",
    }))
    .sort((a, b) => b.impressionCount - a.impressionCount);
}

export function buildQueryAdvice(queries: QueryAnalyticsItem[] = []) {
  const categories = buildQueryCategorySummary(queries);
  const topQuery = queries[0];
  const topCategory = categories[0];

  if (!topQuery) {
    return [
      "SearchQueryLogに流入語句を登録すると、検索露出・クリック率・改善アドバイスを校舎別に確認できます。",
    ];
  }

  const advice = [
    `最も露出が多い「${topQuery.query}」を、GBP投稿・口コミ依頼文・校舎ページ見出しに自然に反映してください。`,
  ];

  if (topCategory) {
    advice.push(
      `${topCategory.intent}カテゴリの表示回数が多いため、関連する実績・料金・指導方針をFAQとして補強するとクリック率改善が見込めます。`,
    );
  }

  const lowCtrQuery = queries.find(
    (query) => query.impressionCount >= 100 && parseFloat(query.ctr) < 5,
  );

  if (lowCtrQuery) {
    advice.push(
      `「${lowCtrQuery.query}」は表示に対してクリックが弱いため、GBPの説明文・写真・投稿タイトルを検索意図に合わせて見直してください。`,
    );
  }

  return advice;
}

export function buildQueryAnalyticsPayload({
  schoolId,
  month,
  logs,
}: {
  schoolId: string;
  month: string;
  logs: SearchQueryLogSource[];
}) {
  const queries = normalizeSearchQueryLogs(logs);

  return {
    schoolId,
    targetMonth: month,
    summary: buildQueryAnalyticsSummary(queries),
    categories: buildQueryCategorySummary(queries),
    advice: buildQueryAdvice(queries),
    queries,
  };
}
