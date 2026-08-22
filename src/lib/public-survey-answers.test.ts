import { describe, expect, it } from "vitest";
import {
  buildPublicSurveyQuestionAnswers,
  buildReviewGenerationInputFromSurveyAnswers,
  createInitialPublicSurveyAnswers,
  getAnswerValues,
  setSingleSurveyAnswer,
  setTextSurveyAnswer,
  toggleMultiSurveyAnswer,
  type PublicSurveyQuestion,
} from "./public-survey-answers";

const questions: PublicSurveyQuestion[] = [
  {
    id: "q1",
    type: "SINGLE_SELECT",
    question: "通塾のきっかけ",
    options: ["大学受験", "苦手克服"],
    order: 1,
  },
  {
    id: "q2",
    type: "MULTI_SELECT",
    question: "良かった点",
    maxSelect: 2,
    options: ["質問しやすい", "自習室", "価格"],
    order: 2,
  },
  {
    id: "q3",
    type: "TEXT",
    question: "変化",
    options: [],
    order: 3,
  },
];

describe("public-survey-answers", () => {
  it("creates answer state matching DB-backed question types", () => {
    expect(createInitialPublicSurveyAnswers(questions)).toEqual({
      q1: "",
      q2: [],
      q3: "",
    });
  });

  it("updates single, multi, and text answers without mixing question state", () => {
    let answers = createInitialPublicSurveyAnswers(questions);
    answers = setSingleSurveyAnswer(answers, "q1", "大学受験");
    answers = toggleMultiSurveyAnswer(answers, questions[1], "質問しやすい");
    answers = toggleMultiSurveyAnswer(answers, questions[1], "自習室");
    answers = setTextSurveyAnswer(answers, "q3", "自分から学習するようになった");

    expect(buildPublicSurveyQuestionAnswers(questions, answers)).toEqual([
      {
        questionId: "q1",
        question: "通塾のきっかけ",
        type: "SINGLE_SELECT",
        value: "大学受験",
      },
      {
        questionId: "q2",
        question: "良かった点",
        type: "MULTI_SELECT",
        value: ["質問しやすい", "自習室"],
      },
      {
        questionId: "q3",
        question: "変化",
        type: "TEXT",
        value: "自分から学習するようになった",
      },
    ]);
  });

  it("enforces max selection count for multi-select answers", () => {
    let answers = createInitialPublicSurveyAnswers(questions);
    answers = toggleMultiSurveyAnswer(answers, questions[1], "質問しやすい");
    answers = toggleMultiSurveyAnswer(answers, questions[1], "自習室");
    answers = toggleMultiSurveyAnswer(answers, questions[1], "価格");

    expect(answers.q2).toEqual(["質問しやすい", "自習室"]);

    answers = toggleMultiSurveyAnswer(answers, questions[1], "自習室");

    expect(answers.q2).toEqual(["質問しやすい"]);
  });

  it("allows unlimited multi-select answers when maxSelect is not configured", () => {
    const unlimitedQuestion = { ...questions[1], maxSelect: null };
    let answers = createInitialPublicSurveyAnswers([unlimitedQuestion]);
    answers = toggleMultiSurveyAnswer(answers, unlimitedQuestion, "質問しやすい");
    answers = toggleMultiSurveyAnswer(answers, unlimitedQuestion, "自習室");
    answers = toggleMultiSurveyAnswer(answers, unlimitedQuestion, "価格");

    expect(answers.q2).toEqual(["質問しやすい", "自習室", "価格"]);
  });

  it("returns empty answer values for unanswered single questions", () => {
    const result = buildPublicSurveyQuestionAnswers([questions[0]], {});

    expect(result[0].value).toBe("");
  });

  it("normalizes answer values for string and missing entries", () => {
    expect(getAnswerValues({ q1: "大学受験" }, "q1")).toEqual(["大学受験"]);
    expect(getAnswerValues({}, "q1")).toEqual([]);
  });

  it("returns an empty array for unanswered multi-select questions", () => {
    const result = buildPublicSurveyQuestionAnswers([questions[1]], {});

    expect(result[0].value).toEqual([]);
  });

  it("builds prompt input from selected choices and free-text answers", () => {
    const answers = {
      q1: "大学受験",
      q2: ["質問しやすい", "自習室"],
      q3: "家での勉強時間が増えた",
    };

    const input = buildReviewGenerationInputFromSurveyAnswers({
      questions,
      answers,
    });

    expect(input.selectedReasons).toEqual([
      "大学受験",
      "質問しやすい",
      "自習室",
    ]);
    expect(input.freeText).toBe("家での勉強時間が増えた");
    expect(input.freeText).not.toContain("通塾のきっかけ");
    expect(input.freeText).not.toContain("良かった点");
    expect(input.questionAnswers).toHaveLength(3);
    expect(input.questionAnswers.map((answer) => answer.question)).toContain("変化");
  });

  it("joins multiple free-text answers for generated prompt material", () => {
    const input = buildReviewGenerationInputFromSurveyAnswers({
      questions: [
        {
          id: "q3",
          type: "TEXT",
          question: "お子さまの変化",
          options: [],
          order: 1,
        },
      ],
      answers: {
        q3: ["苦手だった数学に向き合えた", "家庭学習の時間が増えた"],
      },
    });

    expect(input.selectedReasons).toEqual([]);
    expect(input.freeText).toBe(
      "苦手だった数学に向き合えた\n家庭学習の時間が増えた",
    );
    expect(input.questionAnswers).toEqual([
      {
        questionId: "q3",
        question: "お子さまの変化",
        type: "TEXT",
        value: ["苦手だった数学に向き合えた", "家庭学習の時間が増えた"],
      },
    ]);
    expect(input.freeText).not.toContain("お子さまの変化");
  });

  it("omits blank answers from generated prompt text", () => {
    const input = buildReviewGenerationInputFromSurveyAnswers({
      questions,
      answers: { q1: " ", q2: [], q3: "" },
    });

    expect(input.selectedReasons).toEqual([]);
    expect(input.freeText).toBe("");
  });

  it("treats public free-text aliases as text answers", () => {
    const input = buildReviewGenerationInputFromSurveyAnswers({
      questions: [
        {
          id: "q-free",
          type: "自由記述",
          question: "高校はどこですか？",
          options: [],
          order: 1,
        },
        {
          id: "q-textarea",
          type: "textarea",
          question: "印象に残っていること",
          options: [],
          order: 2,
        },
      ],
      answers: {
        "q-free": "熊本高校",
        "q-textarea": "質問しやすかった",
      },
    });

    expect(input.selectedReasons).toEqual([]);
    expect(input.freeText).toBe("熊本高校\n質問しやすかった");
    expect(input.questionAnswers).toHaveLength(2);
  });
});
