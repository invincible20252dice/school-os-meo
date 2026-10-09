import { expect, it } from "vitest";
import { aioCompetitorDifference, matchAioCompetitor, savedAioCompetitors } from "./aio-context";
it("reuses latest saved competitor values, rejects ambiguous or different branch matches", () => {
  const saved = savedAioCompetitors([{ checkedAt: new Date("2026-10-09"), competitorData: [{ name: "A予備校", rating: 4.3, reviewCount: 21 }, { name: "不明塾", rating: -1, reviewCount: -1 }] }, { checkedAt: new Date("2026-10-01"), competitorData: [] }]);
  expect(matchAioCompetitor({ name: "Ａ予備校", evidence: "" }, saved)).toMatchObject({ rating: 4.3, reviewCount: 21 });
  expect(matchAioCompetitor({ name: "A予備校別校", evidence: "" }, saved)).toBeNull();
  expect(matchAioCompetitor({ name: "A予備校", evidence: "" }, [...saved, saved[0]])).toBeNull();
  expect(saved[1]).toMatchObject({ rating: null, reviewCount: null });
  expect(savedAioCompetitors([])).toEqual([]);
  expect(savedAioCompetitors([{ checkedAt: new Date(), competitorData: [{ name: "値不明塾" }] }])[0]).toMatchObject({ rating: null, reviewCount: null });
});
it("compares only available saved numeric data and leaves missing values unknown", () => {
  const saved = savedAioCompetitors([{ checkedAt: new Date(), competitorData: [{ name: "自校塾", rating: 4, reviewCount: 10 }, { name: "他校塾", rating: 4.5, reviewCount: 20 }] }]);
  expect(aioCompetitorDifference({ name: "他校塾", evidence: "" }, "自校塾", saved)).toMatchObject({ reviewGap: 10, ratingGap: .5 });
  expect(aioCompetitorDifference({ name: "未知塾", evidence: "" }, "自校塾", saved)).toMatchObject({ reviewGap: null, ratingGap: null });
  expect(aioCompetitorDifference({ name: "他校塾", evidence: "" }, "未知塾", saved)).toMatchObject({ reviewGap: null, ratingGap: null });
});
