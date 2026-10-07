import type { KeywordVolume } from "./meoExtendedData";

// User-supplied fixtures for UI validation, never measured search volumes.
export const DEMAND_SAMPLE: KeywordVolume[] = [
  { id: "1", keyword: "熊本市中央区 個別指導 塾", searchPoint: "通町筋駅", municipality: "熊本市中央区", monthlyVolume: 880, yearlyTrendPercent: 18, cpcYen: 240 },
  { id: "2", keyword: "通町筋 予備校 大学受験", searchPoint: "通町筋駅", municipality: "熊本市中央区", monthlyVolume: 720, yearlyTrendPercent: 15, cpcYen: 290 },
  { id: "3", keyword: "水前寺 塾 中学生", searchPoint: "水前寺駅", municipality: "熊本市中央区", monthlyVolume: 300, yearlyTrendPercent: -4, cpcYen: 180 },
  { id: "4", keyword: "熊本 高校生 個別指導 おすすめ", searchPoint: "通町筋駅", municipality: "熊本市中央区", monthlyVolume: 590, yearlyTrendPercent: 22, cpcYen: 310 },
  { id: "5", keyword: "熊本市東区 塾 個別指導", searchPoint: "健軍町駅", municipality: "東区", monthlyVolume: 640, yearlyTrendPercent: 12, cpcYen: 210 },
  { id: "6", keyword: "帯山 塾 高校生", searchPoint: "東海学園前駅", municipality: "東区", monthlyVolume: 410, yearlyTrendPercent: 8, cpcYen: 200 },
  { id: "7", keyword: "健軍 予備校 大学受験", searchPoint: "健軍町駅", municipality: "東区", monthlyVolume: 320, yearlyTrendPercent: 5, cpcYen: 260 },
  { id: "8", keyword: "熊本駅 予備校 大学受験", searchPoint: "熊本駅", municipality: "西区", monthlyVolume: 580, yearlyTrendPercent: 10, cpcYen: 270 },
  { id: "9", keyword: "熊本市西区 個別指導塾", searchPoint: "熊本駅", municipality: "西区", monthlyVolume: 390, yearlyTrendPercent: 2, cpcYen: 190 },
  { id: "10", keyword: "上熊本 塾 おすすめ", searchPoint: "上熊本駅", municipality: "西区", monthlyVolume: 280, yearlyTrendPercent: -2, cpcYen: 170 },
];
