import { describe, expect, it } from "vitest";
import {
  buildFallbackReviews,
  buildGoogleReviewUrl,
  buildReviewPromptUserContent,
  normalizeReviewRequest,
  REVIEW_GENERATION_SYSTEM_PROMPT,
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

  it("builds natural fallback reviews without question labels or keyword lists", () => {
    const input = normalizeReviewRequest({
      schoolName: "大学受験専門塾 iスクール予備校",
      rating: 5,
      selectedReasons: ["大学受験対策", "価格", "成績の変化"],
      freeText: "苦手だった数学が少しずつ解けるようになりました。",
    });

    const reviews = buildFallbackReviews(input);
    const joinedReviews = reviews.join("\n");

    expect(reviews).toHaveLength(3);
    expect(joinedReviews).not.toContain("通塾のきっかけ");
    expect(joinedReviews).not.toContain("良かったと感じた点");
    expect(joinedReviews).not.toContain("大学受験対策、価格、成績の変化");
    expect(joinedReviews).toContain("苦手だった数学が少しずつ解けるようになりました。");
  });

  it("builds prompt content that forbids question labels and raw keyword lists", () => {
    const input = normalizeReviewRequest({
      schoolName: "大学受験専門塾 iスクール予備校",
      selectedReasons: ["大学受験対策", "価格", "成績の変化"],
      freeText: "模試の成績が上がりました。",
    });
    const userContent = buildReviewPromptUserContent(input);

    expect(REVIEW_GENERATION_SYSTEM_PROMPT).toContain("設問文や質問文自体");
    expect(REVIEW_GENERATION_SYSTEM_PROMPT).toContain("キーワード羅列は禁止");
    expect(userContent).toContain("selectedKeywords");
    expect(userContent).toContain("episode");
    expect(userContent).not.toContain("通塾のきっかけを教えてください");
  });

  it("uses fallback detail and fallback reasons when building reviews", () => {
    const reviews = buildFallbackReviews({
      schoolName: "青葉ゼミナール",
      rating: 5,
      selectedReasons: [],
    });

    expect(reviews).toHaveLength(3);
    expect(reviews.join("\n")).toContain("家庭でも自分から机に向かう時間");
    expect(reviews.join("\n")).toContain("先生が丁寧に見てくれる");
  });

  it("builds a Google review URL from a place id", () => {
    expect(buildGoogleReviewUrl("abc 123")).toBe(
      "https://search.google.com/local/writereview?placeid=abc%20123",
    );
  });
});
