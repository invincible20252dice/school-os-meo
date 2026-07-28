export type InsightMetricKey =
  | "views"
  | "mobileViews"
  | "desktopViews"
  | "averageClickRate"
  | "phoneClicks"
  | "directionRequests"
  | "websiteClicks"
  | "detailViews";

export type InsightValueType = "count" | "percent";

export type InsightTrend = "increase" | "decrease" | "flat";

export type InsightMetricInput = {
  key: InsightMetricKey;
  label: string;
  unit: string;
  valueType: InsightValueType;
  initial: number;
  recent: number;
};

export type InsightComparisonItem = InsightMetricInput & {
  difference: number;
  differenceRate: number | null;
  trend: InsightTrend;
  initialLabel: string;
  recentLabel: string;
  differenceLabel: string;
  differenceRateLabel: string;
};

export type InsightComparisonData = {
  period: string;
  initialPeriod: string;
  recentPeriod: string;
  metrics: InsightMetricInput[];
};

const mockInsightComparisonData: InsightComparisonData = {
  period: "過去30日間",
  initialPeriod: "2025-04-07〜2025-05-06",
  recentPeriod: "2026-06-29〜2026-07-28",
  metrics: [
    {
      key: "views",
      label: "表示回数",
      unit: "回",
      valueType: "count",
      initial: 1240,
      recent: 2386,
    },
    {
      key: "mobileViews",
      label: "モバイル表示",
      unit: "回",
      valueType: "count",
      initial: 840,
      recent: 1712,
    },
    {
      key: "desktopViews",
      label: "PC表示",
      unit: "回",
      valueType: "count",
      initial: 400,
      recent: 674,
    },
    {
      key: "averageClickRate",
      label: "平均クリック率",
      unit: "%",
      valueType: "percent",
      initial: 4.6,
      recent: 6.4,
    },
    {
      key: "phoneClicks",
      label: "電話クリック数",
      unit: "件",
      valueType: "count",
      initial: 36,
      recent: 58,
    },
    {
      key: "directionRequests",
      label: "ルート検索回数",
      unit: "件",
      valueType: "count",
      initial: 74,
      recent: 109,
    },
    {
      key: "websiteClicks",
      label: "ウェブサイトクリック数",
      unit: "件",
      valueType: "count",
      initial: 128,
      recent: 181,
    },
    {
      key: "detailViews",
      label: "メニュー/詳細閲覧数",
      unit: "回",
      valueType: "count",
      initial: 312,
      recent: 286,
    },
  ],
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
}

function formatValue(value: number, metric: InsightMetricInput) {
  return `${formatNumber(value)}${metric.unit}`;
}

function trend(difference: number): InsightTrend {
  if (difference > 0) {
    return "increase";
  }

  if (difference < 0) {
    return "decrease";
  }

  return "flat";
}

function differenceRate(initial: number, difference: number) {
  if (initial === 0) {
    return null;
  }

  return (difference / initial) * 100;
}

function formatDifference(metric: InsightMetricInput, difference: number) {
  const sign = difference > 0 ? "+" : "";
  const unit = metric.valueType === "percent" ? "pt" : metric.unit;

  return `${sign}${formatNumber(difference)}${unit}`;
}

function formatDifferenceRate(value: number | null) {
  if (value === null) {
    return "初期値なし";
  }

  const sign = value > 0 ? "+" : "";

  return `${sign}${formatNumber(Math.round(value * 10) / 10)}%`;
}

export function buildInsightComparisonItems(
  data: InsightComparisonData = mockInsightComparisonData,
): InsightComparisonItem[] {
  return data.metrics.map((metric) => {
    const difference = metric.recent - metric.initial;
    const rate = differenceRate(metric.initial, difference);

    return {
      ...metric,
      difference,
      differenceRate: rate,
      trend: trend(difference),
      initialLabel: formatValue(metric.initial, metric),
      recentLabel: formatValue(metric.recent, metric),
      differenceLabel: formatDifference(metric, difference),
      differenceRateLabel: formatDifferenceRate(rate),
    };
  });
}

export function buildMockInsightComparisonData(): InsightComparisonData {
  return mockInsightComparisonData;
}
