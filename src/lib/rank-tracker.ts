import {
  buildRankSearchLabel,
  normalizeLocationParams,
  type NormalizedLocationParams,
} from "./location-params";

export type CompetitorInput = {
  name: string;
  placeId: string;
  rating?: number;
  reviewCount?: number;
  address?: string;
};

export type CompetitorResult = CompetitorInput & {
  rank: number;
  isOwnSchool: boolean;
};

const ownPlaceId = "aoba-yokohama-main";

const mockCompetitors: CompetitorInput[] = [
  {
    name: "横浜駅前個別アカデミー",
    placeId: "competitor-001",
    rating: 4.6,
    reviewCount: 86,
    address: "横浜市西区南幸",
  },
  {
    name: "西区進学スクール",
    placeId: "competitor-002",
    rating: 4.4,
    reviewCount: 64,
    address: "横浜市西区北幸",
  },
  {
    name: "青葉ゼミナール 本校",
    placeId: ownPlaceId,
    rating: 4.7,
    reviewCount: 112,
    address: "横浜市西区高島",
  },
  {
    name: "横浜個別指導ラボ",
    placeId: "competitor-004",
    rating: 4.2,
    reviewCount: 51,
    address: "横浜市西区平沼",
  },
  {
    name: "みなみ進学教室",
    placeId: "competitor-005",
    rating: 4.1,
    reviewCount: 39,
    address: "横浜市西区南幸",
  },
  {
    name: "横浜中央学習塾",
    placeId: "competitor-006",
    rating: 4.0,
    reviewCount: 47,
    address: "横浜市西区北幸",
  },
  {
    name: "個別指導ステップ横浜校",
    placeId: "competitor-007",
    rating: 4.3,
    reviewCount: 58,
    address: "横浜市西区高島",
  },
  {
    name: "西口学習サポート",
    placeId: "competitor-008",
    rating: 3.9,
    reviewCount: 22,
    address: "横浜市西区南幸",
  },
  {
    name: "横浜受験ゼミ",
    placeId: "competitor-009",
    rating: 4.5,
    reviewCount: 74,
    address: "横浜市西区岡野",
  },
  {
    name: "高島町スクール",
    placeId: "competitor-010",
    rating: 4.1,
    reviewCount: 33,
    address: "横浜市西区高島",
  },
  ...Array.from({ length: 10 }, (_, index) => ({
    name: `横浜学習塾 ${index + 11}`,
    placeId: `competitor-${String(index + 11).padStart(3, "0")}`,
    rating: 3.8 + (index % 3) * 0.2,
    reviewCount: 18 + index * 3,
    address: "横浜市西区",
  })),
];

const mockHistory = [
  { date: "2026-07-16", rank: 6 },
  { date: "2026-07-17", rank: 5 },
  { date: "2026-07-18", rank: 5 },
  { date: "2026-07-19", rank: 4 },
  { date: "2026-07-20", rank: 4 },
  { date: "2026-07-21", rank: 3 },
  { date: "2026-07-22", rank: 3 },
];

export function normalizeCompetitorResults(
  competitors: CompetitorInput[],
  ownGooglePlaceId = ownPlaceId,
): CompetitorResult[] {
  return competitors.slice(0, 20).map((competitor, index) => ({
    ...competitor,
    rank: index + 1,
    isOwnSchool: competitor.placeId === ownGooglePlaceId,
  }));
}

export function findOwnSchoolRank(
  competitors: CompetitorResult[],
  ownGooglePlaceId: string,
) {
  return (
    competitors.find((competitor) => competitor.placeId === ownGooglePlaceId)
      ?.rank ?? null
  );
}

export function buildMockRankTrackerDashboard() {
  const location: NormalizedLocationParams = normalizeLocationParams({
    nearestStation: "横浜駅",
    municipality: "横浜市西区",
    latitude: 35.4658,
    longitude: 139.6223,
    radiusMeters: 1500,
  });
  const keyword = "横浜駅 個別指導 塾";
  const competitors = normalizeCompetitorResults(mockCompetitors, ownPlaceId);
  const rank = findOwnSchoolRank(competitors, ownPlaceId);

  return {
    target: {
      id: "target-keyword-demo-001",
      schoolName: "青葉ゼミナール 本校",
      keyword,
      ownGooglePlaceId: ownPlaceId,
      location,
    },
    searchLabel: buildRankSearchLabel({ keyword, location }),
    latest: {
      checkedAt: "2026-07-22 02:10",
      rank,
      previousRank: 4,
      change: rank ? 4 - rank : null,
    },
    competitors,
    history: mockHistory,
  };
}
