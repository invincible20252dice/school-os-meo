export type ReviewLanguage = "all" | "ja" | "en";
export type ReviewSentiment = "positive" | "neutral" | "negative";

export type ReviewAnalyticsTab = {
  key: ReviewLanguage;
  label: string;
  count: number;
};

export type ReviewOpinionInput = {
  id: string;
  label: string;
  category: string;
  sentiment: ReviewSentiment;
  count: number;
};

export type ReviewOpinion = ReviewOpinionInput & {
  percentage: number;
};

export type ReviewSentimentSummary = {
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  positivePercentage: number;
  neutralPercentage: number;
  negativePercentage: number;
};

export type ReviewAnalyticsData = {
  tabs: ReviewAnalyticsTab[];
  opinions: ReviewOpinionInput[];
};

export type NormalizedReviewAnalyticsData = {
  tabs: ReviewAnalyticsTab[];
  opinions: ReviewOpinion[];
  sentiment: ReviewSentimentSummary;
};

const fallbackReviewAnalyticsData: ReviewAnalyticsData = {
  tabs: [
    { key: "all", label: "全体", count: 128 },
    { key: "ja", label: "日本語", count: 116 },
    { key: "en", label: "英語", count: 12 },
  ],
  opinions: [
    {
      id: "instruction",
      label: "指導が丁寧で親切",
      category: "指導品質",
      sentiment: "positive",
      count: 42,
    },
    {
      id: "result",
      label: "成績や学習習慣の変化を実感",
      category: "成果実感",
      sentiment: "positive",
      count: 26,
    },
    {
      id: "classroom",
      label: "教室が清潔で集中しやすい",
      category: "教室環境",
      sentiment: "positive",
      count: 18,
    },
    {
      id: "price",
      label: "料金設定が分かりやすい",
      category: "料金説明",
      sentiment: "positive",
      count: 14,
    },
    {
      id: "schedule",
      label: "振替や面談の日程調整がしやすい",
      category: "運営対応",
      sentiment: "positive",
      count: 11,
    },
    {
      id: "waiting",
      label: "問い合わせ返信に時間がかかる",
      category: "連絡対応",
      sentiment: "negative",
      count: 7,
    },
    {
      id: "homework",
      label: "宿題量にばらつきがある",
      category: "学習管理",
      sentiment: "neutral",
      count: 6,
    },
    {
      id: "parking",
      label: "送迎時の駐輪・駐車スペースが限られる",
      category: "通塾環境",
      sentiment: "negative",
      count: 4,
    },
  ],
};

function percentage(count: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((count / total) * 1000) / 10;
}

function safeCount(count: number | null | undefined) {
  return typeof count === "number" && Number.isFinite(count) && count > 0
    ? Math.round(count)
    : 0;
}

function safeSentiment(
  sentiment: ReviewSentiment | null | undefined,
): ReviewSentiment {
  return sentiment === "positive" || sentiment === "neutral" || sentiment === "negative"
    ? sentiment
    : "neutral";
}

export function buildReviewAnalyticsData(): ReviewAnalyticsData {
  return fallbackReviewAnalyticsData;
}

export function normalizeReviewAnalyticsData(
  data: Partial<ReviewAnalyticsData> = {},
): NormalizedReviewAnalyticsData {
  const tabs = data.tabs?.length ? data.tabs : fallbackReviewAnalyticsData.tabs;
  const rawOpinions = data.opinions?.length ? data.opinions : [];
  const total = rawOpinions.reduce((sum, opinion) => sum + safeCount(opinion.count), 0);
  const sentimentCounts = rawOpinions.reduce(
    (counts, opinion) => {
      counts[safeSentiment(opinion.sentiment)] += safeCount(opinion.count);
      return counts;
    },
    {
      positive: 0,
      neutral: 0,
      negative: 0,
    },
  );

  return {
    tabs: tabs.map((tab) => ({
      key: tab.key,
      label: tab.label,
      count: safeCount(tab.count),
    })),
    opinions: rawOpinions.map((opinion) => ({
      ...opinion,
      count: safeCount(opinion.count),
      sentiment: safeSentiment(opinion.sentiment),
      percentage: percentage(safeCount(opinion.count), total),
    })),
    sentiment: {
      total,
      positive: sentimentCounts.positive,
      neutral: sentimentCounts.neutral,
      negative: sentimentCounts.negative,
      positivePercentage: percentage(sentimentCounts.positive, total),
      neutralPercentage: percentage(sentimentCounts.neutral, total),
      negativePercentage: percentage(sentimentCounts.negative, total),
    },
  };
}
