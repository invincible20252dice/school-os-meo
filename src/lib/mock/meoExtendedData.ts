export type KeywordTimeBand = "noon" | "evening" | "midnight";
export type RankValue = number | null;

export type TimeBandRank = {
  band: KeywordTimeBand;
  label: string;
  measuredAt: string;
  rank: RankValue;
  kpBadge: "上位維持" | "改善余地" | "要対策";
};

export type KeywordTimeRank = {
  id: string;
  keyword: string;
  location: string;
  timeBands: TimeBandRank[];
};

export type KeywordVolume = {
  id: string;
  keyword: string;
  searchPoint: string;
  municipality: string;
  monthlyVolume: number;
  yearlyTrendPercent: number;
  cpcYen: number;
};

export type QueryCloudItem = {
  query: string;
  count: number;
  intent: "地域" | "料金" | "講習" | "評判" | "学年";
};

export type ReviewTrendPoint = {
  month: string;
  reviewCount: number;
  averageRating: number;
};

export type ProtectionField = {
  key: "businessName" | "category" | "phone" | "address" | "websiteUrl";
  label: string;
  currentValue: string;
  correctValue: string;
  locked: boolean;
  detectedSuggestion: string | null;
};

export type MeoExtendedData = {
  keywordTimeRanks: KeywordTimeRank[];
  keywordVolumes: KeywordVolume[];
  queryCloud: QueryCloudItem[];
  reviewTrends: ReviewTrendPoint[];
  protection: {
    autoRestoreEnabled: boolean;
    detectedCount: number;
    fields: ProtectionField[];
  };
};

const mockMeoExtendedData: MeoExtendedData = {
  keywordTimeRanks: [
    {
      id: "kw-time-001",
      keyword: "熊本市中央区 個別指導 塾",
      location: "熊本市中央区 / 通町筋駅",
      timeBands: [
        { band: "noon", label: "昼 12:00〜", measuredAt: "12:10", rank: 2, kpBadge: "上位維持" },
        { band: "evening", label: "夕方〜夜 18:00〜", measuredAt: "18:12", rank: 4, kpBadge: "改善余地" },
        { band: "midnight", label: "深夜〜朝 0:00〜", measuredAt: "00:08", rank: 3, kpBadge: "上位維持" },
      ],
    },
    {
      id: "kw-time-002",
      keyword: "東区 学習塾 中学生",
      location: "熊本市東区 / 健軍町駅",
      timeBands: [
        { band: "noon", label: "昼 12:00〜", measuredAt: "12:18", rank: 6, kpBadge: "改善余地" },
        { band: "evening", label: "夕方〜夜 18:00〜", measuredAt: "18:20", rank: 3, kpBadge: "上位維持" },
        { band: "midnight", label: "深夜〜朝 0:00〜", measuredAt: "00:12", rank: null, kpBadge: "要対策" },
      ],
    },
    {
      id: "kw-time-003",
      keyword: "熊本駅 塾 高校受験",
      location: "熊本市西区 / 熊本駅",
      timeBands: [
        { band: "noon", label: "昼 12:00〜", measuredAt: "12:24", rank: 5, kpBadge: "改善余地" },
        { band: "evening", label: "夕方〜夜 18:00〜", measuredAt: "18:25", rank: 7, kpBadge: "要対策" },
        { band: "midnight", label: "深夜〜朝 0:00〜", measuredAt: "00:18", rank: 5, kpBadge: "改善余地" },
      ],
    },
  ],
  keywordVolumes: [
    { id: "vol-001", keyword: "熊本市中央区 個別指導 塾", searchPoint: "通町筋駅", municipality: "熊本市中央区", monthlyVolume: 880, yearlyTrendPercent: 18, cpcYen: 240 },
    { id: "vol-002", keyword: "熊本市東区 学習塾", searchPoint: "健軍町駅", municipality: "東区", monthlyVolume: 620, yearlyTrendPercent: 9, cpcYen: 210 },
    { id: "vol-003", keyword: "熊本駅 塾 高校受験", searchPoint: "熊本駅", municipality: "西区", monthlyVolume: 410, yearlyTrendPercent: 14, cpcYen: 260 },
    { id: "vol-004", keyword: "水前寺 塾 中学生", searchPoint: "水前寺駅", municipality: "熊本市中央区", monthlyVolume: 300, yearlyTrendPercent: -4, cpcYen: 180 },
    { id: "vol-005", keyword: "長嶺 塾 小学生", searchPoint: "長嶺", municipality: "東区", monthlyVolume: 260, yearlyTrendPercent: 7, cpcYen: 170 },
  ],
  queryCloud: [
    { query: "熊本市 個別指導 塾", count: 342, intent: "地域" },
    { query: "中央区 塾 評判", count: 215, intent: "評判" },
    { query: "中学生 定期テスト 対策", count: 188, intent: "学年" },
    { query: "夏期講習 熊本", count: 164, intent: "講習" },
    { query: "塾 月謝 比較", count: 121, intent: "料金" },
    { query: "健軍町 学習塾", count: 94, intent: "地域" },
    { query: "高校受験 個別指導", count: 82, intent: "学年" },
    { query: "小学生 英語 塾", count: 70, intent: "学年" },
  ],
  reviewTrends: [
    { month: "2025-08", reviewCount: 5, averageRating: 4.3 },
    { month: "2025-09", reviewCount: 7, averageRating: 4.4 },
    { month: "2025-10", reviewCount: 6, averageRating: 4.4 },
    { month: "2025-11", reviewCount: 8, averageRating: 4.5 },
    { month: "2025-12", reviewCount: 10, averageRating: 4.6 },
    { month: "2026-01", reviewCount: 9, averageRating: 4.6 },
    { month: "2026-02", reviewCount: 12, averageRating: 4.7 },
    { month: "2026-03", reviewCount: 14, averageRating: 4.7 },
    { month: "2026-04", reviewCount: 11, averageRating: 4.6 },
    { month: "2026-05", reviewCount: 16, averageRating: 4.8 },
    { month: "2026-06", reviewCount: 18, averageRating: 4.8 },
    { month: "2026-07", reviewCount: 21, averageRating: 4.9 },
  ],
  protection: {
    autoRestoreEnabled: true,
    detectedCount: 2,
    fields: [
      { key: "businessName", label: "ビジネス名", currentValue: "青葉ゼミナール 熊本本校", correctValue: "青葉ゼミナール 熊本本校", locked: true, detectedSuggestion: null },
      { key: "category", label: "カテゴリ", currentValue: "学習塾", correctValue: "学習塾", locked: true, detectedSuggestion: "予備校" },
      { key: "phone", label: "電話番号", currentValue: "096-000-1234", correctValue: "096-000-1234", locked: true, detectedSuggestion: "096-000-9999" },
      { key: "address", label: "所在地", currentValue: "熊本県熊本市中央区手取本町1-1", correctValue: "熊本県熊本市中央区手取本町1-1", locked: true, detectedSuggestion: null },
      { key: "websiteUrl", label: "ウェブサイトURL", currentValue: "https://example-school.jp", correctValue: "https://example-school.jp", locked: true, detectedSuggestion: null },
    ],
  },
};

export function buildMeoExtendedData(): MeoExtendedData {
  return mockMeoExtendedData;
}

export function formatRank(rank: RankValue): string {
  return rank ? `${rank}位` : "圏外";
}

export function filterKeywordVolumes(
  volumes: KeywordVolume[] = [],
  municipality = "全地域",
): KeywordVolume[] {
  if (municipality === "全地域") {
    return volumes;
  }

  return volumes.filter((volume) => volume?.municipality === municipality);
}

export function getVolumeMunicipalities(volumes: KeywordVolume[] = []): string[] {
  return ["全地域", ...Array.from(new Set(volumes.map((volume) => volume?.municipality).filter(Boolean)))];
}

export function getQueryCloudScale(queries: QueryCloudItem[] = []) {
  const max = Math.max(...queries.map((query) => query?.count ?? 0), 0);

  return queries.map((query) => ({
    ...query,
    weight: max > 0 ? Math.round(((query?.count ?? 0) / max) * 4) + 1 : 1,
  }));
}

export function buildReviewTrendPath(points: ReviewTrendPoint[] = []) {
  if (points.length === 0) {
    return "";
  }

  const maxCount = Math.max(...points.map((point) => point?.reviewCount ?? 0), 1);
  const width = 320;
  const height = 140;

  return points
    .map((point, index) => {
      const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
      const y = height - ((point?.reviewCount ?? 0) / maxCount) * height;
      return `${index === 0 ? "M" : "L"} ${Math.round(x)} ${Math.round(y)}`;
    })
    .join(" ");
}

export function countDetectedSuggestions(fields: ProtectionField[] = []): number {
  return fields.filter((field) => Boolean(field?.detectedSuggestion)).length;
}
