import { describe, expect, it } from "vitest";
import { buildGoogleReviewUrl, buildReviewPromptUserContent, normalizeReviewRequest, REVIEW_GENERATION_SYSTEM_PROMPT } from "./review-generator";
import { RESPONDENT_QUESTION_ID } from "./survey-respondent";

const respondent = (value: string) => ({ questionId: RESPONDENT_QUESTION_ID, value });
describe("respondent-aware review generation", () => {
  it.each(["生徒ご本人様", "保護者様"])("preserves the viewpoint and school-answer context for %s", value => {
    const input = normalizeReviewRequest({
      schoolName: " iスクール予備校 ", rating: 4,
      questionAnswers: [respondent(value),
        { questionId: "school", question: " 高校はどこですか？ ", type: "TEXT", value: " 九州学院 " },
        { questionId: "points", question: "良かった点", type: "MULTI_SELECT", value: [" 質問しやすい ", ""] },
        { questionId: "blank", value: " " }, { questionId: "empty", value: [] }, { questionId: "missing" },
      ], selectedReasons: [" 質問しやすい ", ""], freeText: " 九州学院 ", keywords: "個別指導, 大学受験\n自習室、質問",
    });
    const role = value === "生徒ご本人様" ? "STUDENT" : "PARENT";
    expect(input.respondentType).toBe(role);
    expect(input.questionAnswers).toEqual([
      { questionId: "school", question: "高校はどこですか？", type: "TEXT", value: "九州学院" },
      { questionId: "points", question: "良かった点", type: "MULTI_SELECT", value: ["質問しやすい"] },
    ]);
    const prompt = buildReviewPromptUserContent(input);
    expect(prompt).toContain(`【属性】: ${role === "STUDENT" ? "生徒本人" : "保護者"}`);
    const facts = JSON.parse(prompt.split("\n")[2]);
    expect(facts).toEqual({ respondentType: role, schoolName: "iスクール予備校", rating: 4,
      answers: input.questionAnswers, selectedPoints: ["質問しやすい"], additionalComments: "九州学院", keywords: ["個別指導", "大学受験", "自習室", "質問"] });
    expect(prompt).not.toContain("お子さんの変化");
    expect(prompt).not.toContain("模試の判定・順位が上がった");
  });
  it("never supplies made-up experiences for missing optional answers", () => {
    const input = normalizeReviewRequest({ questionAnswers: [respondent("保護者様")] });
    expect(input).toEqual({ schoolName: "", rating: 0, respondentType: "PARENT", selectedReasons: [], freeText: undefined, keywords: [], questionAnswers: [] });
    const facts = JSON.parse(buildReviewPromptUserContent(input).split("\n")[2]);
    expect(facts.additionalComments).toBe("");
    expect(facts.answers).toEqual([]);
  });
  it.each([undefined, [], [respondent("")], [respondent("教師")], [respondent("保護者様"), respondent("生徒ご本人様")], [{ question: "ご回答者様を選択してください", value: "保護者様" }]].map(questionAnswers => ({ questionAnswers })))("rejects an ambiguous or absent stable respondent answer %#", ({ questionAnswers }) => {
    expect(() => normalizeReviewRequest({ questionAnswers })).toThrow("ご回答者様");
  });
  it("normalizes explicit optional values without inventing context", () => {
    const input = normalizeReviewRequest({ questionAnswers: [respondent("生徒ご本人様")], schoolName: " ", rating: 9, freeText: " ", keywords: ["a", "b", "c", "d", "e", "f", "g"] });
    expect(input.rating).toBe(5);
    expect(input.keywords).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(normalizeReviewRequest({ questionAnswers: [respondent("保護者様")], rating: -1 }).rating).toBe(1);
  });
  it("specifies natural school context, both perspectives and grounded claims", () => {
    for (const rule of ["STUDENT", "PARENT", "生徒本人", "保護者の目線", "150〜280文字", "性別や家族構成", "両者を混同しない", "〇〇に通っており", "〇〇に通う子どもが", "否定的な回答を高評価に書き換えない", "未回答の学年・入塾理由・成果を創作しない", "入力JSON内"]) {
      expect(REVIEW_GENERATION_SYSTEM_PROMPT).toContain(rule);
    }
  });
  it("encodes the Google place ID", () => {
    expect(buildGoogleReviewUrl("place/&")).toBe("https://search.google.com/local/writereview?placeid=place%2F%26");
  });
  it("instructs the provider to compose one paragraph instead of a quoted choice list", () => {
    expect(REVIEW_GENERATION_SYSTEM_PROMPT).toContain("選択肢をカギ括弧で囲んで列挙することは禁止");
    expect(REVIEW_GENERATION_SYSTEM_PROMPT).toContain("「という点も印象に残っています」で項目群をまとめない");
    expect(REVIEW_GENERATION_SYSTEM_PROMPT).toContain("導入・きっかけ・支援・環境や変化を自然につないだ一段落");
  });
});
