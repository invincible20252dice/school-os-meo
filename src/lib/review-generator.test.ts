import { describe, expect, it } from "vitest";
import {
  buildFallbackReview,
  buildFallbackReviews,
  buildGoogleReviewUrl,
  buildReviewPromptUserContent,
  normalizeReviewRequest,
  pickReviewWritingAngle,
  REVIEW_GENERATION_PRESENCE_PENALTY,
  REVIEW_GENERATION_SYSTEM_PROMPT,
  REVIEW_GENERATION_TEMPERATURE,
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
    expect(reviews.join("\n")).toContain("先生の説明が具体的でわかりやすい");
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
    expect(review).not.toContain("大学受験対策を考えて");
    expect(review).not.toContain("価格も本人には合っていた");
    expect(review).toContain("苦手だった数学が少しずつ解けるようになりました。");
  });

  it("rewrites choice labels into natural Japanese fallback clauses", () => {
    const input = normalizeReviewRequest({
      schoolName: "大学受験専門塾 iスクール予備校",
      selectedReasons: [
        "大学受験の専門対策をしたかった",
        "模試の成績・判定が伸び悩んでいた",
        "質問しやすさ",
      ],
      questionAnswers: [
        {
          question: "学年",
          value: "高校2年生",
        },
        {
          question: "通塾のきっかけを教えてください",
          value: "大学受験の専門対策をしたかった",
        },
        {
          question: "良かったと感じた点を選んでください",
          value: ["模試の成績・判定が伸び悩んでいた", "質問しやすさ"],
        },
      ],
    });

    const review = buildFallbackReview(input);

    expect(review).toContain("大学受験に向けて");
    expect(review).toContain("本人が質問しやすい雰囲気");
    expect(review).not.toContain("したかったを");
    expect(review).not.toContain("伸び悩んでいたも");
  });

  it("covers trigger and growth rewrites for common survey choices", () => {
    const review = buildFallbackReview(
      normalizeReviewRequest({
        schoolName: "大学受験専門塾 iスクール予備校",
        selectedReasons: ["定期テスト対策", "面談の丁寧さ", "勉強量が増えた"],
        questionAnswers: [
          { question: "通塾のきっかけ", value: "苦手科目の克服" },
          { question: "良かった点", value: ["面談の丁寧さ", "教室の雰囲気"] },
          { question: "お子さまの変化", value: ["勉強量が増えた", "自信がついた"] },
        ],
      }),
    );
    const recommendationReview = buildFallbackReview(
      normalizeReviewRequest({
        schoolName: "大学受験専門塾 iスクール予備校",
        selectedReasons: ["推薦入試対策", "料金", "自信がついた"],
        questionAnswers: [
          { question: "通塾のきっかけ", value: "推薦入試対策" },
          { question: "良かった点", value: ["料金", "先生の説明"] },
          { question: "お子さまの変化", value: "自信がついた" },
        ],
      }),
    );

    expect(review).toContain("苦手科目を一つずつ立て直したかったこと");
    expect(review).toContain("面談で状況を丁寧に共有してもらえる");
    expect(review).toContain("家でも机に向かう時間が自然と増えてきた");
    expect(recommendationReview).toContain("推薦入試も見据えて早めに準備したかったこと");
    expect(recommendationReview).toContain("費用面も納得しやすく続けやすい");
    expect(recommendationReview).toContain("苦手だった単元にも前向きに取り組めるようになった");
  });

  it("handles test-prep triggers and emptied labels without broken fallback text", () => {
    const testPrepReview = buildFallbackReview(
      normalizeReviewRequest({
        schoolName: "大学受験専門塾 iスクール予備校",
        selectedReasons: ["定期テスト対策", "質問しやすさ"],
        questionAnswers: [
          { question: "通塾のきっかけ", value: "定期テスト対策" },
          { question: "良かった点", value: "質問しやすさ" },
        ],
      }),
    );
    const emptiedLabelReview = buildFallbackReview(
      normalizeReviewRequest({
        schoolName: "大学受験専門塾 iスクール予備校",
        selectedReasons: ["したかった", "料金"],
        questionAnswers: [
          { question: "通塾のきっかけ", value: "したかった" },
          { question: "良かった点", value: "料金" },
        ],
      }),
    );

    expect(testPrepReview).toContain("学校の定期テスト対策を丁寧に進めたかったこと");
    expect(emptiedLabelReview).toContain("学習面をしっかり相談したかったこと");
    expect(emptiedLabelReview).not.toContain("したかったがきっかけ");
  });

  it("keeps generic labels readable instead of forcing awkward particles", () => {
    const review = buildFallbackReview(
      normalizeReviewRequest({
        schoolName: "大学受験専門塾 iスクール予備校",
        selectedReasons: ["目的を整理したい", "親身な対応", "落ち着いて学べる"],
        questionAnswers: [
          { question: "通塾のきっかけ", value: "目的を整理したい" },
          { question: "良かった点", value: ["親身な対応"] },
          { question: "お子さまの変化", value: "落ち着いて学べる" },
        ],
      }),
    );

    expect(review).toContain("目的を整理したいことがきっかけ");
    expect(review).toContain("親身な対応と感じられるところに安心感");
    expect(review).toContain("落ち着いて学べるようになったので");
    expect(review).not.toContain("親身な対応ところ");
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
    expect(REVIEW_GENERATION_SYSTEM_PROMPT).toContain("固定テンプレート構文");
    expect(REVIEW_GENERATION_SYSTEM_PROMPT).toContain("そのままコピペ結合しない");
    expect(userContent).toContain("【学年】: 高校生");
    expect(userContent).toContain("【通塾のきっかけ】: 大学受験対策");
    expect(userContent).toContain("【良かったと感じた点】: 先生の説明, 質問しやすさ");
    expect(userContent).toContain("【自由記述・補足】: 模試の成績が上がりました。");
    expect(userContent).toContain("【含めたいキーワード】: 個別指導, 大学受験");
    expect(userContent).toContain("【今回の語り口】:");
  });

  it("sets diverse OpenAI generation parameters and chooses bounded writing angles", () => {
    expect(REVIEW_GENERATION_TEMPERATURE).toBeGreaterThanOrEqual(0.85);
    expect(REVIEW_GENERATION_TEMPERATURE).toBeLessThanOrEqual(0.9);
    expect(REVIEW_GENERATION_PRESENCE_PENALTY).toBe(0.6);
    expect(pickReviewWritingAngle(0)).toContain("入塾前");
    expect(pickReviewWritingAngle(0.999)).toContain("受験");
  });

  it("uses fallback detail and fallback reasons when building reviews", () => {
    const reviews = buildFallbackReviews({
      schoolName: "青葉ゼミナール",
      rating: 5,
      selectedReasons: [],
      keywords: ["個別指導", "大学受験"],
    });

    expect(reviews).toHaveLength(1);
    expect(reviews.join("\n")).toContain("家でも自分から机に向かう時間");
    expect(reviews.join("\n")).toContain("先生の説明が具体的でわかりやすい");
    expect(reviews.join("\n")).toContain("地域で個別指導や大学受験");
  });

  it("builds a Google review URL from a place id", () => {
    expect(buildGoogleReviewUrl("abc 123")).toBe(
      "https://search.google.com/local/writereview?placeid=abc%20123",
    );
  });
});
