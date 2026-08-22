import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SurveyClient, {
  getPublicSurveyReviewDestinationUrl,
} from "./survey-client";
import type { SerializedPublicSurveyResponse } from "@/lib/public-survey-query";
import { DEFAULT_GOOGLE_REVIEW_URL } from "@/lib/google-review-url";

const publicQuestions = [
  {
    id: "q1",
    title: "通塾のきっかけを教えてください",
    type: "single",
    question: "通塾のきっかけを教えてください",
    internalType: "SINGLE_SELECT",
    maxSelect: null,
    options: ["学習習慣づけ", "苦手科目の克服"],
    order: 1,
    placeholder: undefined,
  },
  {
    id: "q2",
    title: "良かったと感じた点を選んでください",
    type: "multiple",
    question: "良かったと感じた点を選んでください",
    internalType: "MULTI_SELECT",
    maxSelect: 3,
    options: ["先生の説明", "質問しやすさ"],
    order: 2,
    placeholder: undefined,
  },
  {
    id: "q3",
    title: "お子さまの変化を教えてください",
    type: "text",
    question: "お子さまの変化を教えてください",
    internalType: "TEXT",
    maxSelect: null,
    options: [],
    order: 3,
    placeholder: "自由記述入力欄",
  },
  {
    id: "q4",
    title: "口コミに入れてもよい学年を選んでください",
    type: "single",
    question: "口コミに入れてもよい学年を選んでください",
    internalType: "SINGLE_SELECT",
    maxSelect: null,
    options: ["小学生", "中学生", "高校生"],
    order: 4,
    placeholder: undefined,
  },
  {
    id: "q5",
    title: "選択設問",
    type: "single",
    question: "選択設問",
    internalType: "SINGLE_SELECT",
    maxSelect: null,
    options: ["はい", "いいえ"],
    order: 5,
    placeholder: undefined,
  },
];

const initialData: SerializedPublicSurveyResponse = {
  success: true,
  school: {
    id: "cms5tnzlr0001jt04qh0lluva",
    name: "大学受験専門塾 iスクール予備校",
  },
  schoolName: "大学受験専門塾 iスクール予備校",
  googleReviewUrl: "https://g.page/r/CcECT8Glzr4bEBM/review",
  survey: {
    id: "cmt13bqey0001ld044a196d0e",
    title: "予備校下通り校",
    keywords: "下通り, 街, 個別指導, 大学受験, 安心な価格",
    requiredKeywords: "下通り, 街, 個別指導, 大学受験, 安心な価格",
    minChars: 100,
    maxChars: 300,
    minCharCount: 100,
    maxCharCount: 300,
    reward: "なし",
    benefitType: "",
    benefitShowTiming: "",
    items: [],
    questions: publicQuestions,
  },
  questions: publicQuestions,
};

describe("SurveyClient", () => {
  it("renders public survey questions from server-provided initial data immediately", () => {
    const html = renderToString(
      createElement(SurveyClient, {
        schoolId: "cms5tnzlr0001jt04qh0lluva",
        surveyId: "cmt13bqey0001ld044a196d0e",
        initialData,
      }),
    );

    expect(html).toContain("大学受験専門塾 iスクール予備校");
    expect(html).toContain("予備校下通り校");
    expect(html).toContain("通塾のきっかけを教えてください");
    expect(html).toContain("良かったと感じた点を選んでください");
    expect(html).toContain("お子さまの変化を教えてください");
    expect(html).toContain("100〜300文字を目安に入力");
    expect(html).toContain("<textarea");
    expect(html).toContain("口コミに入れてもよい学年を選んでください");
    expect(html).toContain("選択設問");
    expect(html).toContain("AIで口コミを生成");
    expect(html).not.toContain("AIで口コミを3案生成");
    expect(html).not.toContain("設問データを取得できませんでした");
  });

  it("falls back to the iSchool review URL when the saved review URL is incomplete", () => {
    expect(
      getPublicSurveyReviewDestinationUrl(
        "https://search.google.com/local/writereview",
      ),
    ).toBe(DEFAULT_GOOGLE_REVIEW_URL);
  });

  it("falls back to the iSchool review URL when the saved review URL contains an internal manual id", () => {
    expect(
      getPublicSurveyReviewDestinationUrl(
        "https://search.google.com/local/writereview?placeid=manual-f0f5e2ce-8579-4738-9c1b-c3065738323f",
      ),
    ).toBe(DEFAULT_GOOGLE_REVIEW_URL);
  });
});
