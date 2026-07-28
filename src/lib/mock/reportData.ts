export type ReportMetric = {
  label: string;
  value: string;
  detail: string;
  trend: string;
  tone: "good" | "watch" | "alert";
};

export type ReportAction = {
  title: string;
  detail: string;
  owner: string;
};

export type MonthlyReportData = {
  schoolName: string;
  period: string;
  score: number;
  rank: "S" | "A" | "B" | "C";
  monthOverMonth: string;
  aiComment: string;
  metrics: ReportMetric[];
  actions: ReportAction[];
};

export type NullableMonthlyReportData = {
  schoolName?: string | null;
  period?: string | null;
  score?: number | null;
  rank?: MonthlyReportData["rank"] | null;
  monthOverMonth?: string | null;
  aiComment?: string | null;
  metrics?: Array<Partial<ReportMetric> | null> | null;
  actions?: Array<Partial<ReportAction> | null> | null;
};

const fallbackReportData: MonthlyReportData = {
  schoolName: "青葉ゼミナール 本校",
  period: "2026年7月度",
  score: 88,
  rank: "A",
  monthOverMonth: "+6点",
  aiComment:
    "口コミ返信率と地域キーワードの投稿頻度が改善しています。来月は最寄り駅名を含むGBP投稿と、低評価口コミへの即時返信を優先すると総合評価の伸びが見込めます。",
  metrics: [
    {
      label: "口コミ獲得・返信率",
      value: "18件 / 94%",
      detail: "平均評価 4.7 / 5.0",
      trend: "+4件・返信率 +12pt",
      tone: "good",
    },
    {
      label: "MEO順位",
      value: "平均 3.2位",
      detail: "主要8キーワードのGoogleマップ順位",
      trend: "前月比 1.1位改善",
      tone: "good",
    },
    {
      label: "Instagram連携状況",
      value: "12投稿",
      detail: "GBP投稿へのAIリライト同期 9件",
      trend: "エンゲージメント +18%",
      tone: "watch",
    },
    {
      label: "AIOスコア",
      value: "74/100",
      detail: "AI検索での推奨度・言及率",
      trend: "+8 前月比",
      tone: "good",
    },
  ],
  actions: [
    {
      title: "保護者への口コミ依頼を週2件追加",
      detail: "高評価の授業満足コメントを自然に増やし、口コミ獲得ペースを維持します。",
      owner: "教室長",
    },
    {
      title: "地域キーワード「横浜駅 個別指導 塾」の投稿強化",
      detail: "最寄り駅、市区町村、対象学年を含むGBP投稿を毎週更新します。",
      owner: "MEO担当",
    },
    {
      title: "AIO未言及キーワードのFAQ追加",
      detail: "小学生英語、定期テスト対策、通塾エリアを公式ページとGBP説明に反映します。",
      owner: "コンテンツ担当",
    },
  ],
};

function text(value: string | null | undefined, fallback: string) {
  return value?.trim() ? value : fallback;
}

function score(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : fallback;
}

function rank(value: MonthlyReportData["rank"] | null | undefined) {
  return value === "S" || value === "A" || value === "B" || value === "C"
    ? value
    : fallbackReportData.rank;
}

function tone(value: ReportMetric["tone"] | null | undefined) {
  return value === "good" || value === "watch" || value === "alert"
    ? value
    : "watch";
}

export function buildMockMonthlyReportData(): MonthlyReportData {
  return fallbackReportData;
}

export function normalizeMonthlyReportData(
  data: NullableMonthlyReportData = {},
): MonthlyReportData {
  return {
    schoolName: text(data.schoolName, fallbackReportData.schoolName),
    period: text(data.period, fallbackReportData.period),
    score: score(data.score, fallbackReportData.score),
    rank: rank(data.rank),
    monthOverMonth: text(data.monthOverMonth, fallbackReportData.monthOverMonth),
    aiComment: text(data.aiComment, fallbackReportData.aiComment),
    metrics:
      data.metrics?.map((metric, index) => {
        const fallback =
          fallbackReportData.metrics[index] ?? fallbackReportData.metrics[0];

        return {
          label: text(metric?.label, fallback.label),
          value: text(metric?.value, fallback.value),
          detail: text(metric?.detail, fallback.detail),
          trend: text(metric?.trend, fallback.trend),
          tone: tone(metric?.tone),
        };
      }) ?? fallbackReportData.metrics,
    actions:
      data.actions?.map((action, index) => {
        const fallback =
          fallbackReportData.actions[index] ?? fallbackReportData.actions[0];

        return {
          title: text(action?.title, fallback.title),
          detail: text(action?.detail, fallback.detail),
          owner: text(action?.owner, fallback.owner),
        };
      }) ?? fallbackReportData.actions,
  };
}
