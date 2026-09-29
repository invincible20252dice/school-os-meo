import { describe, expect, it } from "vitest";
import { buildAnswerBasedReview } from "./review-template";
import type { NormalizedReviewRequest } from "./review-generator";

const input = (overrides: Partial<NormalizedReviewRequest> = {}): NormalizedReviewRequest => ({
  respondentType: "STUDENT", schoolName: "iスクール予備校", rating: 5,
  selectedReasons: [], keywords: [], questionAnswers: [], ...overrides,
});
const answer = (question: string, value: string | string[], type = "SINGLE_SELECT") => ({ question, value, type });
const fullAnswers = [
  answer("高校はどこですか？", "済々黌", "TEXT"), answer("学年", "高校1年生"),
  answer("入塾のきっかけ", ["何から勉強していいかわからない", "大学受験対策", "大学受験の専門対策をしたかった"]),
  answer("良かった点", ["わかりやすい個別指導", "質問しやすさ", "質問しやすい", "先生への質問のしやすさ"]),
  answer("変化", "勉強時間が増えた"),
  answer("環境", "自習室が静かで集中できる"),
  answer("今後", "受験本番まで引き続きお願いしたいです"),
];

describe("topic-based review composition", () => {
  it.each(["STUDENT", "PARENT"] as const)("composes a complete four-part %s review without one sentence per choice", respondentType => {
    const result = buildAnswerBasedReview(input({ respondentType, questionAnswers: fullAnswers }));
    const intro = respondentType === "STUDENT"
      ? "済々黌に通う高校1年生で、iスクール予備校で学んでいます。"
      : "済々黌に通う高校1年生の子どもがiスクール予備校に通っています。";
    expect(result.split("\n\n")).toEqual([
      intro,
      "入塾前は、何から勉強を始めればよいかわからないことが悩みでした。大学受験の対策を目的に、通塾を決めました。",
      "わかりやすい個別指導と先生への質問のしやすさが、通う中で良いと感じる点です。通塾後は、勉強時間の増加という変化もありました。",
      "静かで集中しやすい自習室も魅力です。受験本番まで引き続きお世話になりたいです。",
    ]);
    expect(result.match(/大学受験の対策/g)).toHaveLength(1);
    expect(result.match(/質問のしやすさ/g)).toHaveLength(1);
    for (const unwanted of ["私は", "通塾については", "済々黌高校", "全教科", "優しく", "家より", "下通", "成績が上が", "感謝"]) expect(result).not.toContain(unwanted);
  });

  it.each([
    ["STUDENT", "済々黌高校", "高校2年生", "済々黌高校に通う高校2年生で、iスクール予備校で学んでいます。"],
    ["PARENT", "九州学院", "", "九州学院に通う子どもがiスクール予備校に通っています。"],
    ["STUDENT", "九州学院", "", "九州学院に通っており、iスクール予備校で学んでいます。"],
    ["PARENT", "", "中学生", "中学生の子どもがiスクール予備校に通っています。"],
    ["STUDENT", "", "高校1年生", "高校1年生で、iスクール予備校で学んでいます。"],
    ["PARENT", "", "", "子どもがiスクール予備校に通っています。"],
    ["STUDENT", "", "", "iスクール予備校に通っています。"],
  ] as const)("merges introduction for %s, %s, %s", (respondentType, highSchool, grade, intro) => {
    const result = buildAnswerBasedReview(input({ respondentType, questionAnswers: [answer("学校名", highSchool, "TEXT"), answer("学年", grade), answer("良かった点", "質問しやすい")] }));
    expect(result.split("\n\n")[0]).toBe(intro);
    expect(result).not.toMatch(/高校高校|学院高校|中学生.*高校生/);
  });

  it.each([
    ["STUDENT", "九州学院", "", "九州学院に通っています。"],
    ["STUDENT", "九州学院", "高校3年生", "九州学院に通う高校3年生です。"],
    ["STUDENT", "", "高校3年生", "高校3年生です。"],
    ["PARENT", "九州学院", "高校3年生", "九州学院に通う高校3年生の子どもの保護者です。"],
    ["PARENT", "", "高校3年生", "高校3年生の子どもの保護者です。"],
  ] as const)("does not invent a tutoring school when none was supplied %#", (respondentType, highSchool, grade, intro) => {
    expect(buildAnswerBasedReview(input({ schoolName: "", respondentType, questionAnswers: [answer("高校名", highSchool), answer("学年", grade)] }))).toBe(intro);
  });

  it("joins three related support facts once, rather than repeating the same predicate", () => {
    const result = buildAnswerBasedReview(input({ schoolName: "", selectedReasons: ["質問しやすい", "面談の丁寧さ", "個別カリキュラムを組んでくれる"] }));
    expect(result).toBe("先生への質問のしやすさ、学習相談や面談の丁寧さと個別に組んでもらえるカリキュラムが、通う中で良いと感じる点です。");
    expect(result.match(/良いと感じる/g)).toHaveLength(1);
  });

  it.each(["STUDENT", "PARENT"] as const)("keeps person-dependent pace and habit wording consistent for %s", respondentType => {
    const result = buildAnswerBasedReview(input({ schoolName: "", respondentType, selectedReasons: ["自分に合ったペースで進められる", "自ら机に向かう習慣がついた", "志望校合格に向けて頑張りたい"] }));
    if (respondentType === "STUDENT") {
      expect(result).toContain("自分に合った学習ペース");
      expect(result).toContain("自分から机に向かう習慣");
      expect(result).toContain("志望校合格に向けて頑張りたいと思います。");
      expect(result).not.toContain("子ども");
    } else {
      expect(result).toContain("子どもに合った学習ペース");
      expect(result).toContain("子どもが自ら机に向かう習慣");
      expect(result).toContain("子どもの志望校合格に向けて支えていきたいと思います。");
    }
  });

  it("does not mistake negative answers containing positive keywords for praise", () => {
    const result = buildAnswerBasedReview(input({ schoolName: "", questionAnswers: [
      answer("不満な点", ["価格", "個別カリキュラムを組んでくれる"]),
      answer("感想", ["質問しにくい", "自習室に集中できない"]),
      answer("感想", "まだ成績は変わっていません。", "TEXT"),
    ] }));
    expect(result).toContain("「価格」と「個別カリキュラムを組んでくれる」という点は気になっています。");
    expect(result).toContain("「質問しにくい」と「自習室に集中できない」という点も印象に残っています。");
    expect(result).toContain("まだ成績は変わっていません。");
    for (const invented of ["安心感", "良いと感じ", "集中しやすい", "向上", "意欲"]) expect(result).not.toContain(invented);
  });

  it("groups new custom choices without losing them or repeating a stock sentence", () => {
    const result = buildAnswerBasedReview(input({ schoolName: "", questionAnswers: [
      answer("きっかけ", ["知人の紹介", "体験授業"]), { value: ["独自の授業", "送迎", "送迎", " "] }, { value: undefined },
    ] }));
    expect(result).toBe("「知人の紹介」と「体験授業」というきっかけもありました。\n\n「独自の授業」と「送迎」という点も印象に残っています。");
  });
  it.each(["text", "TEXT", "textarea", "free", "free_text", "自由記述"])("preserves personal free text (%s), including its punctuation, only once", type => {
    expect(buildAnswerBasedReview(input({ schoolName: "", questionAnswers: [answer("感想", "先生に感謝しています！", type), answer("その他", "先生に感謝しています！", type)] }))).toBe("先生に感謝しています！");
  });
  it("keeps free text even with no choice facts and does not pad it", () => {
    expect(buildAnswerBasedReview(input({ schoolName: "", freeText: "質問まで待ち時間が長い" }))).toBe("質問まで待ち時間が長い。");
  });
  it("does not duplicate aggregate fields or convert keywords into experience", () => {
    expect(buildAnswerBasedReview(input({ schoolName: "", questionAnswers: [{ value: [" 質問しやすい ", "質問しやすさ"] }], selectedReasons: ["成績の変化"], freeText: "合格", keywords: ["逆転合格"] }))).toBe("先生への質問のしやすさが、通う中で良いと感じる点です。");
  });
  it("does not fabricate four paragraphs for empty or withheld answers", () => {
    expect(buildAnswerBasedReview(input({ keywords: ["合格"] }))).toBe("");
    expect(buildAnswerBasedReview(input({ questionAnswers: [answer("高校名", "記載しない"), answer("学年", "記載しない")] }))).toBe("");
  });
  it("does not mix a parent's intent into a student's draft", () => {
    const selectedReasons = ["安心して子供を任せられる塾です", "もっと早く通わせればよかったです"];
    expect(buildAnswerBasedReview(input({ selectedReasons }))).toBe("");
    expect(buildAnswerBasedReview(input({ respondentType: "PARENT", selectedReasons }))).toContain("安心して子どもを任せられる塾だと感じています。もっと早く通わせればよかったと思います。");
  });
  it("can describe actual improvement without claiming instruction or an environment", () => {
    expect(buildAnswerBasedReview(input({ schoolName: "", selectedReasons: ["模試の判定・順位が上がった"] }))).toBe("通塾後は、模試の判定や順位の向上という変化がありました。");
  });
  it.each([
    ["苦手科目の克服", "苦手科目の克服を目的に"],
    ["学習習慣づくり", "学習習慣の定着を目的に"],
    ["推薦・総合型選抜の対策が必要だった", "推薦入試などの選抜対策を目的に"],
    ["志望校への合格方法が分からなかった", "志望校に向けた勉強の進め方がわからないことが悩み"],
    ["模試の成績・判定が伸び悩んでいた", "模試の成績や判定が伸び悩んでいたことが悩み"],
    ["学校や集団授業についていけない", "学校や集団授業についていけないことが悩み"],
    ["先生の説明", "先生の説明が、通う中で良い"],
    ["先生にいつでも質問・相談しやすい", "先生にいつでも質問や相談ができること"],
    ["定期的な面談で進捗がわかり安心", "定期的な面談で進捗がわかる安心感"],
    ["学習計画を立ててもらえる", "学習計画を立ててもらえること"],
    ["やることが明確になった", "やるべきことが明確になったこと"],
    ["勉強法や計画まで細かく教えてくれる", "勉強法や計画まで細かく教えてもらえること"],
    ["苦手単元を根本から克服できる", "苦手単元を根本から克服できる指導"],
    ["モチベーションを引き出してくれる", "学習意欲を引き出してくれる対応"],
    ["価格", "価格面での安心感"],
    ["成績の変化", "成績の良い変化"],
    ["苦手科目に自信がついた", "苦手科目への自信"],
    ["志望校合格への道筋が見えた", "志望校に向けた道筋が見えたこと"],
    ["教室の雰囲気", "教室の雰囲気も魅力です。"],
    ["下通りで通塾が便利", "下通りの通いやすい立地も魅力です。"],
    ["個別指導でじっくり伸ばしたい方におすすめです", "個別指導でじっくり学びたい方におすすめしたいです。"],
  ])("grounds the vocabulary mapping for %s in the chosen fact only", (value, phrase) => {
    const result = buildAnswerBasedReview(input({ schoolName: "", selectedReasons: [value] }));
    expect(result).toContain(phrase);
    expect(result).not.toContain("「");
    expect(result).not.toContain("全教科");
    expect(result).not.toContain("合格できました");
  });
});
