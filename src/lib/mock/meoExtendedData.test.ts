import { describe, expect, it } from "vitest";
import {
  buildMeoExtendedData,
  buildReviewTrendPath,
  countDetectedSuggestions,
  filterKeywordVolumes,
  formatRank,
  getQueryCloudScale,
  getVolumeMunicipalities,
} from "./meoExtendedData";

describe("meo extended mock data", () => {
  it("builds data for all extended MEO dashboard sections", () => {
    const data = buildMeoExtendedData();

    expect(data.keywordTimeRanks).toHaveLength(3);
    expect(data.keywordTimeRanks[0]?.timeBands.map((band) => band.label)).toEqual([
      "昼 12:00〜",
      "夕方〜夜 18:00〜",
      "深夜〜朝 0:00〜",
    ]);
    expect(data.keywordVolumes.length).toBeGreaterThan(3);
    expect(data.queryCloud.length).toBeGreaterThan(5);
    expect(data.reviewTrends).toHaveLength(12);
    expect(data.protection.fields).toHaveLength(5);
  });

  it("formats ranks and filters keyword volume by municipality", () => {
    const data = buildMeoExtendedData();

    expect(formatRank(1)).toBe("1位");
    expect(formatRank(null)).toBe("圏外");
    expect(getVolumeMunicipalities(data.keywordVolumes)).toEqual([
      "全地域",
      "熊本市中央区",
      "東区",
      "西区",
    ]);
    expect(filterKeywordVolumes(data.keywordVolumes, "東区").map((item) => item.id)).toEqual([
      "vol-002",
      "vol-005",
    ]);
  });

  it("builds query cloud weights and review trend paths safely", () => {
    const data = buildMeoExtendedData();
    const cloud = getQueryCloudScale(data.queryCloud);

    expect(cloud[0]?.weight).toBe(5);
    expect(cloud.at(-1)?.weight).toBeGreaterThanOrEqual(1);
    expect(buildReviewTrendPath(data.reviewTrends)).toMatch(/^M /);
    expect(buildReviewTrendPath([])).toBe("");
  });

  it("covers default and edge branches for demand, cloud, and trend helpers", () => {
    const data = buildMeoExtendedData();

    expect(filterKeywordVolumes(data.keywordVolumes)).toHaveLength(
      data.keywordVolumes.length,
    );
    expect(filterKeywordVolumes(undefined, "東区")).toEqual([]);
    expect(getVolumeMunicipalities()).toEqual(["全地域"]);
    expect(getQueryCloudScale()).toEqual([]);
    expect(getQueryCloudScale([{ query: "未計測", count: 0, intent: "地域" }])).toEqual([
      { query: "未計測", count: 0, intent: "地域", weight: 1 },
    ]);
    expect(
      getQueryCloudScale([{ query: "件数なし", count: undefined as never, intent: "地域" }]),
    ).toEqual([{ query: "件数なし", count: undefined, intent: "地域", weight: 1 }]);
    expect(buildReviewTrendPath([{ month: "2026-07", reviewCount: 10, averageRating: 4.8 }])).toBe(
      "M 160 0",
    );
    expect(
      buildReviewTrendPath([
        { month: "2026-07", reviewCount: undefined as never, averageRating: 4.8 },
      ]),
    ).toBe("M 160 140");
  });

  it("counts detected business profile suggestions", () => {
    const data = buildMeoExtendedData();

    expect(countDetectedSuggestions(data.protection.fields)).toBe(2);
    expect(countDetectedSuggestions([])).toBe(0);
  });
});
