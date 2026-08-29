import { describe, expect, it } from "vitest";
import { buildDashboardRankingData } from "./dashboard-rankings";

describe("dashboard-rankings", () => {
  it("builds ranking and AIO dashboard data from TargetKeyword records", () => {
    const checkedAt = new Date("2026-08-29T01:00:00.000Z");
    const data = buildDashboardRankingData({
      school: {
        id: "school-1",
        name: "大学受験専門塾 iスクール予備校",
        prefecture: "熊本県",
        city: "熊本市中央区",
        addressLine: "下通1丁目12-27 CORE21 下通ビル5F",
        googlePlaceId: "place-ischool",
      },
      keywords: [
        {
          id: "keyword-1",
          schoolId: "school-1",
          keyword: "熊本 大学受験 塾",
          location: "熊本市中央区下通",
          nearestStation: "通町筋駅",
          municipality: "熊本市中央区",
          latitude: "32.801600",
          longitude: "130.709500",
          radiusMeters: 1500,
          isActive: true,
          createdAt: checkedAt,
          rankHistories: [
            {
              id: "rank-1",
              rank: 3,
              checkedAt,
              competitorData: [
                {
                  rank: 1,
                  name: "武田塾 熊本校",
                  rating: 4.8,
                  reviewCount: 45,
                  address: "熊本市中央区手取本町",
                },
                {
                  rank: 3,
                  name: "大学受験専門塾 iスクール予備校",
                  rating: 5,
                  reviewCount: 2,
                  address: "熊本市中央区下通",
                },
              ],
            },
          ],
          aioScoreHistories: [
            {
              id: "aio-1",
              schoolId: "school-1",
              keywordId: "keyword-1",
              chatgptScore: 90,
              geminiScore: 70,
              googleAiScore: 80,
              totalScore: 80,
              checkedAt,
              aiMentions: {
                responses: {
                  chatgpt: "iスクール予備校は大学受験対策で推奨できます。",
                  gemini: "iスクール予備校が候補に入ります。",
                  googleAi: "下通周辺の大学受験塾として表示されています。",
                },
              },
            },
          ],
        },
      ],
    });

    expect(data.school).toMatchObject({
      name: "大学受験専門塾 iスクール予備校",
      address: "熊本県熊本市中央区下通1丁目12-27 CORE21 下通ビル5F",
      nearestStation: "通町筋駅",
      municipality: "熊本市中央区",
      latitude: 32.8016,
      longitude: 130.7095,
    });
    expect(data.currentKeyword).toBe("熊本 大学受験 塾");
    expect(data.currentRank).toBe(3);
    expect(data.searchLabel).toBe(
      "熊本 大学受験 塾 / 熊本市中央区 / 通町筋駅 / 32.8016,130.7095 / 1500m",
    );
    expect(data.competitors[1]).toMatchObject({
      name: "大学受験専門塾 iスクール予備校",
      isOwnSchool: true,
    });
    expect(data.aio.summary).toEqual({
      chatgptScore: 90,
      geminiScore: 70,
      googleAiScore: 80,
      totalScore: 80,
    });
    expect(data.aio.mentions.chatgpt).toContain("iスクール予備校");
  });

  it("returns empty display data when no school or keywords are registered", () => {
    const data = buildDashboardRankingData({
      school: null,
      keywords: [],
      keywordRanks: [],
    });

    expect(data.school).toBeNull();
    expect(data.keywords).toEqual([]);
    expect(data.currentKeyword).toBe("");
    expect(data.currentRank).toBeNull();
    expect(data.competitors).toEqual([]);
    expect(data.aio.summary.totalScore).toBe(0);
  });

  it("uses legacy KeywordRank records when RankHistory is not available", () => {
    const data = buildDashboardRankingData({
      school: {
        id: "school-1",
        name: "大学受験専門塾 iスクール予備校",
        city: "熊本市中央区",
      },
      keywords: [
        {
          id: "keyword-1",
          schoolId: "school-1",
          keyword: "下通 個別指導",
          location: "熊本市中央区下通",
          nearestStation: "通町筋駅",
          municipality: "熊本市中央区",
          radiusMeters: 1200,
          isActive: true,
          createdAt: "2026-08-29T00:00:00.000Z",
        },
      ],
      keywordRanks: [
        {
          id: "legacy-rank-1",
          schoolId: "school-1",
          keyword: "下通 個別指導",
          searchArea: "熊本市中央区下通",
          rank: 4,
          previousRank: 6,
          measuredAt: "2026-08-29T00:00:00.000Z",
          competitorData: [{ name: "大学受験専門塾 iスクール予備校" }],
        },
      ],
    });

    expect(data.currentRank).toBe(4);
    expect(data.previousRank).toBe(6);
    expect(data.rankingLogs[0]).toMatchObject({
      keyword: "下通 個別指導",
      searchArea: "熊本市中央区下通",
    });
  });

  it("keeps rendering with a text-only search label when location coordinates are incomplete", () => {
    const data = buildDashboardRankingData({
      school: {
        id: "school-1",
        name: "大学受験専門塾 iスクール予備校",
        googlePlaceId: "place-ischool",
      },
      keywords: [
        {
          id: "keyword-1",
          schoolId: "school-1",
          keyword: "熊本 総合型選抜",
          location: "下通",
          nearestStation: "",
          municipality: "熊本市中央区",
          latitude: { toNumber: () => 32.8016 },
          longitude: null,
          radiusMeters: 1500,
          isActive: true,
          createdAt: "invalid-date",
          rankHistories: [
            {
              id: "rank-1",
              rank: null,
              checkedAt: "invalid-date",
              competitorData: [
                {
                  title: "大学受験専門塾 iスクール予備校",
                  googlePlaceId: "place-ischool",
                  rating: "5",
                  reviewCount: "2",
                },
                null,
              ],
            },
          ],
          aioScoreHistories: [
            {
              id: "aio-1",
              schoolId: "school-1",
              keywordId: "keyword-1",
              chatgptScore: 35,
              geminiScore: 20,
              googleAiScore: 10,
              totalScore: 22,
              checkedAt: "2026-08-29T00:00:00.000Z",
              aiMentions: {
                chatgpt: { responseText: "ChatGPTの回答" },
                gemini: { summary: "Geminiの回答" },
                googleAi: "Google AIの回答",
              },
            },
          ],
        },
      ],
    });

    expect(data.searchLabel).toBe("熊本 総合型選抜 / 熊本市中央区 / 下通");
    expect(data.history[0]).toEqual({ date: "", rank: null });
    expect(data.competitors[0]).toMatchObject({
      name: "大学受験専門塾 iスクール予備校",
      rating: 5,
      reviewCount: 2,
      isOwnSchool: true,
    });
    expect(data.competitors[1]).toMatchObject({
      name: "競合 2",
      rank: 2,
    });
    expect(data.aio.keywordRows[0].status).toBe("未言及");
    expect(data.aio.mentions.gemini).toBe("Geminiの回答");
  });

  it("normalizes decimal-like coordinates without leaking invalid values", () => {
    const data = buildDashboardRankingData({
      school: {
        id: "school-1",
        name: "大学受験専門塾 iスクール予備校",
        city: "熊本市中央区",
      },
      keywords: [
        {
          id: "keyword-1",
          schoolId: "school-1",
          keyword: "熊本 高校生 塾",
          location: "熊本市中央区下通",
          nearestStation: "通町筋駅",
          municipality: "熊本市中央区",
          latitude: { toNumber: () => Number.NaN },
          longitude: { toString: () => "130.7095" },
          radiusMeters: 1500,
          isActive: true,
          createdAt: new Date("2026-08-29T00:00:00.000Z"),
        },
      ],
    });

    expect(data.school?.latitude).toBeUndefined();
    expect(data.school?.longitude).toBe(130.7095);
    expect(data.searchLabel).toBe(
      "熊本 高校生 塾 / 熊本市中央区 / 通町筋駅 / 熊本市中央区下通",
    );
  });
});
