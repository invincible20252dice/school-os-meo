import { describe, expect, it } from "vitest";
import { aggregateReviewAnalysis, isAnalyticsResponse, parseReviewAnalysis, type AnalyticsResponse, type ReviewAnalysis } from "./review-analytics";

const opinion = { category: "指導品質・講師対応" as const, sentiment: "positive" as const, quote: "説明が丁寧" };
const row: ReviewAnalysis = { reviewId: "r1", language: "ja", opinions: [opinion] };
const inputs = [{ id: "r1", text: "先生の説明が丁寧でした。" }];
const response: AnalyticsResponse = { success: true, schoolId: "s1", schoolName: "校舎", totalReviews: 1, sampledReviews: 1, textReviews: 1, limit: 50, analyses: [row] };

describe("grounded review analysis", () => {
  it("accepts exact source quotes, not invented summaries", () => {
    expect(parseReviewAnalysis({ reviews: [row] }, inputs)).toEqual([row]);
    expect(parseReviewAnalysis({ reviews: [{ ...row, opinions: [] }] }, inputs)[0].opinions).toEqual([]);
  });
  it.each([null, [], {}, { reviews: [] }, { reviews: [null] }, { reviews: [{ ...row, reviewId: 1 }] }, { reviews: [{ ...row, reviewId: "foreign" }] }, { reviews: [{ ...row, language: "fr" }] }, { reviews: [{ ...row, opinions: null }] }, { reviews: [{ ...row, opinions: Array(9).fill(opinion) }] }])("rejects invalid review shapes %#", value => {
    expect(() => parseReviewAnalysis(value, inputs)).toThrow("INVALID_ANALYSIS");
  });
  it.each([null, { ...opinion, category: "unknown" }, { ...opinion, sentiment: "mixed" }, { ...opinion, quote: null }, { ...opinion, quote: " " }, { ...opinion, quote: "x".repeat(501) }, { ...opinion, quote: "順位が54位から7位に上がった" }])("rejects ungrounded or invalid opinions %#", value => {
    expect(() => parseReviewAnalysis({ reviews: [{ ...row, opinions: [value] }] }, inputs)).toThrow("INVALID_ANALYSIS");
  });
  it("rejects duplicate reviews and categories so counts cannot inflate", () => {
    expect(() => parseReviewAnalysis({ reviews: [row, row] }, [...inputs, { id: "r2", text: "説明が丁寧" }])).toThrow();
    expect(() => parseReviewAnalysis({ reviews: [{ ...row, opinions: [opinion, opinion] }] }, inputs)).toThrow();
  });
  it("computes multilingual sentiment and category denominators from extracted opinions", () => {
    const rows: ReviewAnalysis[] = [row, { reviewId: "r2", language: "en", opinions: [{ ...opinion, sentiment: "negative", quote: "Long wait" }, { category: "料金", sentiment: "neutral", quote: "Price" }] }, { reviewId: "r3", language: "other", opinions: [] }];
    const all = aggregateReviewAnalysis(rows);
    expect(all.tabs.map(tab => tab.count)).toEqual([3, 1, 1, 1]);
    expect(all.totalOpinions).toBe(3);
    expect(all.sentiment).toEqual({ positive: 33.3, neutral: 33.3, negative: 33.3 });
    expect(all.categories).toEqual([{ name: "指導品質・講師対応", count: 2, percentage: 66.7 }, { name: "料金", count: 1, percentage: 33.3 }]);
    expect(aggregateReviewAnalysis(rows, "ja").sentiment).toEqual({ positive: 100, neutral: 0, negative: 0 });
    expect(aggregateReviewAnalysis(rows, "other").totalOpinions).toBe(0);
    expect(aggregateReviewAnalysis([]).categories).toEqual([]);
  });
  it("validates successful and empty API contracts", () => {
    expect(isAnalyticsResponse(response)).toBe(true);
    expect(isAnalyticsResponse({ ...response, schoolId: null, totalReviews: 0, sampledReviews: 0, textReviews: 0, analyses: [] })).toBe(true);
  });
  it("enforces the sampling limit without confusing sample size with the total", () => {
    expect(isAnalyticsResponse({ ...response, totalReviews: 100, sampledReviews: 50 })).toBe(true);
    expect(isAnalyticsResponse({ ...response, totalReviews: 100, sampledReviews: 51 })).toBe(false);
    expect(isAnalyticsResponse({ ...response, limit: 0 })).toBe(false);
    expect(isAnalyticsResponse({ ...response, limit: 0, totalReviews: 0, sampledReviews: 0, textReviews: 0, analyses: [] })).toBe(false);
  });
  it.each([null, {}, { ...response, success: false }, { ...response, schoolId: 1 }, { ...response, schoolName: null }, { ...response, totalReviews: -1 }, { ...response, totalReviews: 0.5 }, { ...response, limit: "50" }, { ...response, analyses: null }, { ...response, totalReviews: 0 }, { ...response, sampledReviews: 0 }, { ...response, textReviews: 0 }, { ...response, analyses: [null] }, { ...response, analyses: [{ ...row, language: "bad" }] }])("rejects invalid API contract %#", value => {
    expect(isAnalyticsResponse(value)).toBe(false);
  });
});
