import { describe, expect, it } from "vitest";
import { buildAnswerBasedReview } from "./review-template";
import type { NormalizedReviewRequest } from "./review-generator";

const input = (overrides: Partial<NormalizedReviewRequest> = {}): NormalizedReviewRequest => ({
  respondentType: "STUDENT", schoolName: "実校舎", rating: 5,
  selectedReasons: [], keywords: [], questionAnswers: [], ...overrides,
});

describe("answer-based draft without an external model", () => {
  it.each(["STUDENT", "PARENT"] as const)("preserves %s viewpoint and distinguishes high school from tutoring school", respondentType => {
    const result = buildAnswerBasedReview(input({ respondentType, questionAnswers: [
      { question: "高校はどこですか？", type: "TEXT", value: "済々黌" },
      { question: "学年を教えてください", value: "高校2年生" },
      { question: "良かった点", value: ["自分に合ったペースで進められる", "自ら机に向かう習慣がついた"] },
    ] }));
    const subject = respondentType === "STUDENT" ? "私" : "子ども";
    expect(result).toBe(`${subject}が実校舎で学んでいます。${subject}は済々黌に通っています。${subject}は高校2年生です。${subject}に合ったペースで学習を進められます。${subject}が自ら机に向かう習慣がつきました。`);
    for (const invented of ["済々黌高校", "カリキュラムに詳しい", "合格", "順位", "娘", "息子"]) expect(result).not.toContain(invented);
  });
  it.each([
    ["大学受験対策", "大学受験の対策を目的に通い始めました。"],
    ["大学受験の専門対策をしたかった", "大学受験の専門的な対策をしたいと思い、通い始めました。"],
    ["苦手科目の克服", "苦手科目を克服したいと思い、通い始めました。"],
    ["学習習慣づくり", "学習習慣を身につけたいと思い、通い始めました。"],
    ["推薦入試対策", "推薦入試の対策を目的に通い始めました。"],
    ["模試の成績・判定が伸び悩んでいた", "入塾前は、模試の成績や判定が伸び悩んでいました。"],
    ["先生の説明", "先生の説明が良かったと感じています。"],
    ["質問しやすさ", "質問しやすいところが良いと感じています。"],
    ["質問しやすい", "質問しやすいと感じています。"],
    ["先生への質問のしやすさ", "先生に質問しやすいことが、塾を選んだ決め手でした。"],
    ["面談の丁寧さ", "面談が丁寧だと感じています。"],
    ["教室の雰囲気", "教室の雰囲気が良いと感じています。"],
    ["価格", "価格の面が良いと感じています。"],
    ["成績の変化", "成績に良い変化を感じています。"],
    ["模試の判定・順位が上がった", "通い始めてから、模試の判定や順位が上がりました。"],
    ["自習室が静かで集中できる", "自習室は静かで、集中して勉強できる環境です。"],
    ["わかりやすい個別指導", "個別指導がわかりやすいと感じています。"],
    ["苦手単元を根本から克服できる", "苦手な単元を根本から克服できる指導だと感じています。"],
    ["勉強法や計画まで細かく教えてくれる", "勉強の方法や計画まで細かく教えてもらえます。"],
    ["下通りで通塾が便利", "下通りにあり、通塾に便利です。"],
  ])("rewrites the actual choice %s without verbatim suffix concatenation", (choice, sentence) => {
    expect(buildAnswerBasedReview(input({ schoolName: "", selectedReasons: [choice] }))).toBe(sentence);
  });
  it("preserves negative and custom choices instead of inserting praise", () => {
    const result = buildAnswerBasedReview(input({ questionAnswers: [
      { question: "不満な点", value: "価格" },
      { question: "きっかけ", value: "知人の紹介" },
      { value: "空調が寒い" },
      { question: "感想", type: "text", value: "まだ成績は変わっていません。" },
    ] }));
    expect(result).toBe("私が実校舎で学んでいます。気になっているのは「価格」です。通塾のきっかけは「知人の紹介」です。通塾については「空調が寒い」と感じています。まだ成績は変わっていません。");
  });
  it("does not duplicate structured answers through the aggregate fields or include SEO words as facts", () => {
    expect(buildAnswerBasedReview(input({ schoolName: "", questionAnswers: [
      { value: [" 質問しやすい ", "質問しやすい", " "] }, { value: undefined },
    ], selectedReasons: ["成績の変化"], freeText: "合格できた", keywords: ["逆転合格"] }))).toBe("質問しやすいと感じています。");
  });
  it.each(["text", "TEXT", "textarea", "free", "free_text", "自由記述"])("preserves free text %s without appending awkward particles", type => {
    expect(buildAnswerBasedReview(input({ schoolName: "", questionAnswers: [{ type, value: "説明が助かりました！" }] }))).toBe("説明が助かりました！");
  });
  it("uses explicitly supplied free text when structured answers are absent", () => {
    expect(buildAnswerBasedReview(input({ schoolName: "", freeText: "質問するまで時間がかかる" }))).toBe("質問するまで時間がかかる。");
  });
  it("does not invent experiences from school name, keywords, or a rating alone", () => {
    expect(buildAnswerBasedReview(input({ keywords: ["合格"] }))).toBe("");
    expect(buildAnswerBasedReview(input({ questionAnswers: [
      { question: "高校名", value: "記載しない" }, { question: "学年", value: "記載しない" },
    ] }))).toBe("");
  });
  it("does not turn a parent-only choice into a student's experience", () => {
    expect(buildAnswerBasedReview(input({ selectedReasons: ["安心して子供を任せられる塾です"] }))).toBe("");
    expect(buildAnswerBasedReview(input({ respondentType: "PARENT", selectedReasons: ["安心して子供を任せられる塾です"] }))).toContain("安心して子供を任せられる塾です");
  });
  it("does not look up arbitrary inherited object properties as sentences", () => {
    expect(buildAnswerBasedReview(input({ schoolName: "", selectedReasons: ["constructor"] }))).toBe("通塾については「constructor」と感じています。");
  });
});
