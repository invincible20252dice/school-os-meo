export type AioRecommendationStatus = "高推奨" | "普通" | "未言及";

export type AioMetricCard = {
  label: string;
  value: string;
  helper: string;
  trend?: string;
};

export type AioTrendPoint = {
  date: string;
  score: number;
};

export type AioRadarAxis = {
  axis: string;
  ownSchool: number;
  competitor: number;
};

export type AioMentionRow = {
  query: string;
  chatgptSummary: string;
  perplexitySummary: string;
  geminiSummary: string;
  status: AioRecommendationStatus;
  action: string;
};

export type AioDashboardData = {
  schoolName: string;
  subtitle: string;
  metrics: AioMetricCard[];
  trend: AioTrendPoint[];
  radar: AioRadarAxis[];
  mentions: AioMentionRow[];
};

export type NullableAioDashboardData = {
  schoolName?: string | null;
  subtitle?: string | null;
  metrics?: Array<Partial<AioMetricCard> | null> | null;
  trend?: Array<Partial<AioTrendPoint> | null> | null;
  radar?: Array<Partial<AioRadarAxis> | null> | null;
  mentions?: Array<Partial<AioMentionRow> | null> | null;
};

const fallbackData: AioDashboardData = {
  schoolName: "青葉ゼミナール 本校",
  subtitle: "AI検索エンジンにおける自校の言及率・推奨度スコアの分析",
  metrics: [
    {
      label: "総合AIOスコア",
      value: "74/100",
      helper: "AI検索での総合評価",
      trend: "+8 前月比",
    },
    {
      label: "ChatGPT推奨率",
      value: "82%",
      helper: "主要質問で推奨候補に入る割合",
      trend: "+11pt",
    },
    {
      label: "Perplexity露出度",
      value: "68%",
      helper: "出典付き回答での表示率",
      trend: "+5pt",
    },
    {
      label: "ターゲットキーワード捕捉数",
      value: "18/24",
      helper: "対象キーワード中のランクイン数",
      trend: "+3件",
    },
  ],
  trend: [
    { date: "6/28", score: 58 },
    { date: "7/02", score: 61 },
    { date: "7/06", score: 63 },
    { date: "7/10", score: 66 },
    { date: "7/14", score: 64 },
    { date: "7/18", score: 70 },
    { date: "7/22", score: 72 },
    { date: "7/27", score: 74 },
  ],
  radar: [
    { axis: "認知度", ownSchool: 76, competitor: 82 },
    { axis: "口コミ評価", ownSchool: 88, competitor: 74 },
    { axis: "コース多様性", ownSchool: 69, competitor: 78 },
    { axis: "地域密着度", ownSchool: 91, competitor: 68 },
    { axis: "情報鮮度", ownSchool: 73, competitor: 66 },
  ],
  mentions: [
    {
      query: "横浜駅 個別指導 塾 おすすめ",
      chatgptSummary: "個別対応と自習室の使いやすさを理由に推奨候補として言及。",
      perplexitySummary: "GBP口コミと公式サイト情報を根拠に候補表示。",
      geminiSummary: "競合大手と並列で表示。強い推奨文脈はまだ弱い。",
      status: "高推奨",
      action: "合格実績と定期テスト対策の具体例をGBP投稿へ追加。",
    },
    {
      query: "横浜市西区 中学生 定期テスト対策",
      chatgptSummary: "地域密着型の塾として紹介されるが、教材情報は不足。",
      perplexitySummary: "校舎ページは拾われるが、最新講習ページの引用が弱い。",
      geminiSummary: "未言及。市区町村名を含むページ本文の強化が必要。",
      status: "普通",
      action: "市町村名、最寄り駅、対象学年を含むFAQを追加。",
    },
    {
      query: "横浜駅 小学生 英語 塾",
      chatgptSummary: "小学生英語コースの明確なページが少なく推奨外。",
      perplexitySummary: "関連情報の引用なし。",
      geminiSummary: "未言及。",
      status: "未言及",
      action: "小学生英語コースの説明、時間割、口コミ導線を整備。",
    },
  ],
};

function text(value: string | null | undefined, fallback: string) {
  return value?.trim() ? value : fallback;
}

function numberValue(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeStatus(
  value: AioRecommendationStatus | null | undefined,
): AioRecommendationStatus {
  return value === "高推奨" || value === "普通" || value === "未言及"
    ? value
    : "普通";
}

export function buildMockAioDashboardData(): AioDashboardData {
  return fallbackData;
}

export function normalizeAioDashboardData(
  data: NullableAioDashboardData = {},
): AioDashboardData {
  return {
    schoolName: text(data.schoolName, fallbackData.schoolName),
    subtitle: text(data.subtitle, fallbackData.subtitle),
    metrics:
      data.metrics?.map((metric, index) => {
        const fallback = fallbackData.metrics[index] ?? fallbackData.metrics[0];

        return {
          label: text(metric?.label, fallback.label),
          value: text(metric?.value, fallback.value),
          helper: text(metric?.helper, fallback.helper),
          trend: text(metric?.trend, fallback.trend ?? ""),
        };
      }) ?? fallbackData.metrics,
    trend:
      data.trend?.map((point, index) => {
        const fallback = fallbackData.trend[index] ?? fallbackData.trend[0];

        return {
          date: text(point?.date, fallback.date),
          score: numberValue(point?.score, fallback.score),
        };
      }) ?? fallbackData.trend,
    radar:
      data.radar?.map((axis, index) => {
        const fallback = fallbackData.radar[index] ?? fallbackData.radar[0];

        return {
          axis: text(axis?.axis, fallback.axis),
          ownSchool: numberValue(axis?.ownSchool, fallback.ownSchool),
          competitor: numberValue(axis?.competitor, fallback.competitor),
        };
      }) ?? fallbackData.radar,
    mentions:
      data.mentions?.map((row, index) => {
        const fallback = fallbackData.mentions[index] ?? fallbackData.mentions[0];

        return {
          query: text(row?.query, fallback.query),
          chatgptSummary: text(row?.chatgptSummary, fallback.chatgptSummary),
          perplexitySummary: text(row?.perplexitySummary, fallback.perplexitySummary),
          geminiSummary: text(row?.geminiSummary, fallback.geminiSummary),
          status: normalizeStatus(row?.status),
          action: text(row?.action, fallback.action),
        };
      }) ?? fallbackData.mentions,
  };
}
