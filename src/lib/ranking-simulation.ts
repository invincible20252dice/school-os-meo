import type { DashboardRankingData, DashboardRankingKeyword } from "./dashboard-rankings";

const SCHOOL_ID = "cms5tnzlr0001jt04qh0lluva";
const SAMPLE_NAMES = ["熊本 大学受験 塾", "熊本 予備校 おすすめ", "通町筋 個別指導塾"];
const PLACES: Array<[string, number, number, string]> = [
  ["大学受験専門塾 iスクール予備校", 5, 3, "熊本県熊本市中央区手取本町 CORE21下通ビル5F"],
  ["壺溪塾 本校", 4.1, 42, "熊本県熊本市中央区内坪井町1-1"],
  ["武田塾 熊本校", 4.3, 35, "熊本県熊本市中央区手取本町4-17"],
  ["北九州予備校 熊本校", 3.9, 58, "熊本県熊本市西区春日2-3-1"],
  ["東進衛星予備校 熊本通町校", 4, 22, "熊本県熊本市中央区上通町2-2"],
  ["個別教室のトライ 通町筋校", 3.8, 19, "熊本県熊本市中央区安政町1-2"],
  ["明光義塾 熊本中央教室", 3.7, 15, "熊本県熊本市中央区水道町"],
  ["個別指導Axis 熊本校", 4.2, 12, "熊本県熊本市中央区新町"],
  ["早稲田スクール 高校部本校", 4, 31, "熊本県熊本市中央区水前寺"],
  ["代ゼミサテライン予備校 熊本校", 3.9, 14, "熊本県熊本市中央区辛島町"],
];

// Only the designated demonstration school may receive these non-persisted fixtures.
export function withRankingSimulation(data: DashboardRankingData, keywordId?: string): DashboardRankingData {
  if (data.school?.id !== SCHOOL_ID || data.measuredAt !== null) return { ...data, dataSource: "DATABASE" };
  const keywords: DashboardRankingKeyword[] = data.keywords.length ? data.keywords : SAMPLE_NAMES.map((keyword, index) => ({
    id: `simulation-${index + 1}`, keyword, location: "", municipality: "", nearestStation: "", radiusMeters: 1500, isActive: true,
  }));
  const selected = keywordId ? keywords.find(keyword => keyword.id === keywordId) : keywords[0];
  if (!selected) return { ...data, dataSource: "DATABASE" };
  const recommended = selected.keyword.includes("おすすめ");
  const exam = selected.keyword.includes("大学受験");
  const currentRank = recommended ? 2 : 1;
  const selectedKeyword = { ...selected, location: "熊本市中央区手取本町", municipality: "熊本市中央区手取本町", nearestStation: "通町筋駅", latitude: 32.8032, longitude: 130.7081, radiusMeters: 1500 };
  const places = PLACES.map((place, index) => ({ name: place[0], rating: place[1], reviewCount: place[2], address: place[3], isOwnSchool: index === 0 }));
  if (recommended) [places[0], places[1]] = [places[1], places[0]];
  return {
    ...data, dataSource: "SIMULATION", keywords, selectedKeyword, currentKeyword: selected.keyword,
    school: { ...data.school, name: "iスクール予備校 本校", municipality: selectedKeyword.municipality, nearestStation: selectedKeyword.nearestStation, latitude: selectedKeyword.latitude, longitude: selectedKeyword.longitude },
    currentRank, previousRank: exam ? 1 : recommended ? 3 : 2,
    measuredAt: "2026-10-07T00:00:00.000Z",
    searchLabel: `${selected.keyword} / 熊本市中央区手取本町 / 通町筋駅 / 32.8032,130.7081 / 1500m`,
    history: Array.from({ length: 7 }, (_, index) => ({ date: `2026-10-0${index + 1}`, rank: index < 2 ? (exam ? 2 : index === 0 ? 4 : 3) : index === 2 && !exam ? 3 : currentRank })),
    competitors: places.map((place, index) => ({ ...place, rank: index + 1 })),
  };
}
