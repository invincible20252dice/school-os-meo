import { describe, expect, it } from "vitest";
import {
  buildFallbackReviews,
  buildGoogleReviewUrl,
  normalizeReviewRequest,
} from "./review-generator";

describe("review-generator", () => {
  it("normalizes empty values for review generation", () => {
    const input = normalizeReviewRequest({
      schoolName: "  ",
      rating: 99,
      selectedReasons: ["質問しやすい雰囲気", "", "学習習慣がついた"],
      freeText: "  苦手科目に向き合えるようになった  ",
    });

    expect(input.schoolName).toBe("こちらの塾");
    expect(input.rating).toBe(5);
    expect(input.selectedReasons).toEqual([
      "質問しやすい雰囲気",
      "学習習慣がついた",
    ]);
    expect(input.freeText).toBe("苦手科目に向き合えるようになった");
  });

  it("uses fallback reasons and minimum rating when reason input is missing", () => {
    const input = normalizeReviewRequest({
      schoolName: "青葉ゼミナール",
      rating: -1,
      selectedReasons: undefined,
      freeText: " ",
    });

    expect(input.rating).toBe(1);
    expect(input.selectedReasons).toEqual([
      "先生が丁寧に見てくれる",
      "教室の雰囲気が良い",
      "子どもが前向きに通えている",
    ]);
    expect(input.freeText).toBeUndefined();
  });

  it("limits selected reasons to five usable values", () => {
    const input = normalizeReviewRequest({
      schoolName: "青葉ゼミナール",
      selectedReasons: ["1", "2", "3", "4", "5", "6", " "],
    });

    expect(input.selectedReasons).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("builds exactly three fallback reviews with school context", () => {
    const input = normalizeReviewRequest({
      schoolName: "青葉ゼミナール",
      rating: 5,
      selectedReasons: ["先生の説明がわかりやすい"],
      freeText: "家でも自分から机に向かう日が増えました。",
    });

    const reviews = buildFallbackReviews(input);

    expect(reviews).toHaveLength(3);
    expect(reviews.every((review) => review.includes("青葉ゼミナール"))).toBe(
      true,
    );
    expect(reviews.join("\n")).toContain("先生の説明がわかりやすい");
  });

  it("uses fallback detail and fallback reasons when building reviews", () => {
    const reviews = buildFallbackReviews({
      schoolName: "青葉ゼミナール",
      rating: 5,
      selectedReasons: [],
    });

    expect(reviews).toHaveLength(3);
    expect(reviews.join("\n")).toContain("子どもの様子をよく見ながら");
    expect(reviews.join("\n")).toContain("先生が丁寧に見てくれる");
  });

  it("builds a Google review URL from a place id", () => {
    expect(buildGoogleReviewUrl("abc 123")).toBe(
      "https://search.google.com/local/writereview?placeid=abc%20123",
    );
  });
});
