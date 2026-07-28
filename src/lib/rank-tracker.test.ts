import { describe, expect, it } from "vitest";
import {
  buildMockRankTrackerDashboard,
  findOwnSchoolRank,
  normalizeCompetitorResults,
} from "./rank-tracker";

describe("rank-tracker", () => {
  it("normalizes competitor results and keeps top 20", () => {
    const competitors = normalizeCompetitorResults(
      Array.from({ length: 22 }, (_, index) => ({
        name: `塾 ${index + 1}`,
        placeId: `place_${index + 1}`,
        rating: 4.1,
        reviewCount: 20 + index,
        address: "横浜市西区",
      })),
    );

    expect(competitors).toHaveLength(20);
    expect(competitors[0]).toEqual(
      expect.objectContaining({
        rank: 1,
        name: "塾 1",
        placeId: "place_1",
      }),
    );
    expect(competitors[19].rank).toBe(20);
  });

  it("finds own school rank by Google place id", () => {
    const competitors = normalizeCompetitorResults([
      { name: "競合A", placeId: "place_a" },
      { name: "青葉ゼミナール 本校", placeId: "own_place" },
    ]);

    expect(findOwnSchoolRank(competitors, "own_place")).toBe(2);
    expect(findOwnSchoolRank(competitors, "missing_place")).toBeNull();
  });

  it("marks the default own school when no own place id override is provided", () => {
    const competitors = normalizeCompetitorResults([
      { name: "青葉ゼミナール 本校", placeId: "aoba-yokohama-main" },
    ]);

    expect(competitors[0]).toEqual(
      expect.objectContaining({
        rank: 1,
        isOwnSchool: true,
      }),
    );
  });

  it("builds dashboard data with explicit location parameters", () => {
    const dashboard = buildMockRankTrackerDashboard();

    expect(dashboard.target.keyword).toBe("横浜駅 個別指導 塾");
    expect(dashboard.target.location.municipality).toBe("横浜市西区");
    expect(dashboard.target.location.nearestStation).toBe("横浜駅");
    expect(dashboard.searchLabel).toContain("35.4658,139.6223");
    expect(dashboard.latest.rank).toBe(3);
    expect(dashboard.competitors).toHaveLength(20);
    expect(dashboard.competitors[2].isOwnSchool).toBe(true);
    expect(dashboard.history).toHaveLength(7);
  });
});
