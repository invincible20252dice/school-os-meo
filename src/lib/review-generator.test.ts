import { describe, expect, it } from "vitest";
import {
  buildFallbackReview,
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
      keywords: " 個別指導, 大学受験 ",
      questionAnswers: [
        {
          question: "口コミに入れてもよい学年を選んでください",
          value: "高校生",
        },
      ],
    });

    expect(input.schoolName).toBe("こちらの塾");
    expect(input.rating).toBe(5);
    expect(input.selectedReasons).toEqual([
      "質問しやすい雰囲気",
      "学習習慣がついた",
    ]);
    expect(input.keywords).toEqual(["個別指導", "大学受験"]);
    expect(input.questionAnswers).toEqual([
      {
        question: "口コミに入れてもよい学年を選んでください",
        type: undefined,
        value: "高校生",
      },
    ]);
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

  it("normalizes array keywords and removes blank question answers", () => {
    const input = normalizeReviewRequest({
      schoolName: "青葉ゼミナール",
      selectedReasons: ["大学受験対策"],
      keywords: [" 個別指導 ", "", "大学受験"],
      questionAnswers: [
        { question: "学年", value: " " },
        { question: "良かった点", value: ["質問しやすさ", " "] },
      ],
    });

    expect(input.keywords).toEqual(["個別指導", "大学受験"]);
    expect(input.questionAnswers).toEqual([
      {
        question: "良かった点",
        type: undefined,
        value: ["質問しやすさ"],
      },
    ]);
  });

  it("builds exactly one fallback review with school context", () => {
    const input = normalizeReviewRequest({
      schoolName: "青葉ゼミナール",
      rating: 5,
      selectedReasons: ["先生の説明がわかりやすい"],
    });

    const reviews = buildFallbackReviews(input);

    expect(reviews).toHaveLength(1);
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

    const review = buildFallbackReview(input);

    expect(review).not.toContain("通塾のきっかけ");
    expect(review).not.toContain("良かったと感じた点");
    expect(review).not.toContain("大学受験対策、価格、成績の変化");
    expect(review).not.toContain("苦手だった数学が少しずつ解けるようになりました。");
  });

  it("builds prompt content for one choice-based review", () => {
    const input = normalizeReviewRequest({
      schoolName: "大学受験専門塾 iスクール予備校",
      selectedReasons: ["大学受験対策", "価格", "成績の変化"],
      freeText: "模試の成績が上がりました。",
      keywords: "個別指導, 大学受験",
      questionAnswers: [
        {
          question: "口コミに入れてもよい学年を選んでください",
          value: "高校生",
        },
        {
          question: "通塾のきっかけを教えてください",
          value: "大学受験対策",
        },
        {
          question: "良かったと感じた点を選んでください",
          value: ["先生の説明", "質問しやすさ"],
        },
      ],
    });
    const userContent = buildReviewPromptUserContent(input);

    expect(REVIEW_GENERATION_SYSTEM_PROMPT).toContain("1つの口コミ文");
    expect(REVIEW_GENERATION_SYSTEM_PROMPT).toContain("複数案は不要");
    expect(userContent).toContain("【学年】: 高校生");
    expect(userContent).toContain("【通塾のきっかけ】: 大学受験対策");
    expect(userContent).toContain("【良かったと感じた点】: 先生の説明, 質問しやすさ");
    expect(userContent).toContain("【含めたいキーワード】: 個別指導, 大学受験");
    expect(userContent).not.toContain("模試の成績が上がりました。");
  });

  it("uses fallback detail and fallback reasons when building reviews", () => {
    const reviews = buildFallbackReviews({
      schoolName: "青葉ゼミナール",
      rating: 5,
      selectedReasons: [],
      keywords: ["個別指導", "大学受験"],
    });

    expect(reviews).toHaveLength(1);
    expect(reviews.join("\n")).toContain("家庭でも自分から机に向かう時間");
    expect(reviews.join("\n")).toContain("先生が丁寧に見てくれる");
    expect(reviews.join("\n")).toContain("地域で個別指導や大学受験");
  });

  it("builds a Google review URL from a place id", () => {
    expect(buildGoogleReviewUrl("abc 123")).toBe(
      "https://search.google.com/local/writereview?placeid=abc%20123",
    );
  });
});
