import { describe, expect, it } from "vitest";
import {
  buildPublicSurveyPreviewSteps,
  extractPublicSurveyQuestions,
  normalizePublicSurveyQuestion,
} from "./public-survey-response";

describe("public-survey-response", () => {
  it("extracts questions from the top-level public response", () => {
    const questions = extractPublicSurveyQuestions({
      questions: [
        {
          id: "q1",
          title: "通塾のきっかけを教えてください",
          type: "single",
          options: ["学習習慣づけ", "定期テスト対策"],
          order: 1,
        },
      ],
    });

    expect(questions).toEqual([
      {
        id: "q1",
        type: "SINGLE_SELECT",
        question: "通塾のきっかけを教えてください",
        maxSelect: undefined,
        options: ["学習習慣づけ", "定期テスト対策"],
        order: 1,
      },
    ]);
  });

  it("extracts questions from survey.questions before survey.items", () => {
    const questions = extractPublicSurveyQuestions({
      survey: {
        questions: [
          {
            questionId: "q2",
            questionText: "良かった点を選んでください",
            questionType: "MULTIPLE_CHOICE",
            choices: ["先生の説明", "質問しやすさ"],
            maxSelect: 3,
          },
        ],
        items: [
          {
            id: "ignored",
            question: "使われない設問",
            type: "TEXT",
            options: [],
          },
        ],
      },
    });

    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      id: "q2",
      type: "MULTI_SELECT",
      question: "良かった点を選んでください",
      maxSelect: 3,
      options: ["先生の説明", "質問しやすさ"],
      order: 1,
    });
  });

  it("extracts questions from items aliases and normalizes label/options keys", () => {
    const questions = extractPublicSurveyQuestions({
      items: [
        {
          label: "お子さまの変化を教えてください",
          type: "text",
          items: ["不要な選択肢"],
        },
      ],
    });

    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      id: "question-1",
      type: "TEXT",
      question: "お子さまの変化を教えてください",
      options: ["不要な選択肢"],
      order: 1,
    });
  });

  it("parses JSON string question and option arrays before binding state", () => {
    const questions = extractPublicSurveyQuestions({
      survey: {
        questionsJson: JSON.stringify([
          {
            id: "q-json",
            title: "口コミに入れてもよい学年を選んでください",
            type: "single",
            options: JSON.stringify(["小学生", "中学生", "高校生"]),
          },
        ]),
      },
    });

    expect(questions).toEqual([
      {
        id: "q-json",
        type: "SINGLE_SELECT",
        question: "口コミに入れてもよい学年を選んでください",
        maxSelect: undefined,
        options: ["小学生", "中学生", "高校生"],
        order: 1,
      },
    ]);
  });

  it("drops malformed question rows instead of creating empty rendered fields", () => {
    expect(
      [
        normalizePublicSurveyQuestion(null, 1),
        normalizePublicSurveyQuestion({ id: "q", type: "single" }, 2),
      ].filter(Boolean),
    ).toEqual([]);
  });

  it("builds public answer steps through the same preview rules as the builder", () => {
    const steps = buildPublicSurveyPreviewSteps({
      schoolId: "school-1",
      title: "予備校下通り校",
      minCharCount: 100,
      maxCharCount: 300,
      questions: [
        {
          id: "q1",
          type: "SINGLE_SELECT",
          question: "通塾のきっかけを教えてください",
          options: ["学習習慣づけ", "苦手科目の克服"],
          order: 2,
        },
        {
          id: "q2",
          type: "MULTI_SELECT",
          question: "良かった点を選んでください",
          maxSelect: 3,
          options: ["先生の説明", "質問しやすさ"],
          order: 1,
        },
        {
          id: "q3",
          type: "TEXT",
          question: "変化を教えてください",
          options: [],
          order: 3,
        },
      ],
    });

    expect(steps.map((step) => step.id)).toEqual(["q2", "q1", "q3"]);
    expect(steps.map((step) => step.helperText)).toEqual([
      "最大3つまで選択できます",
      "1つ選択してください",
      "100〜300文字を目安に入力",
    ]);
  });

  it("keeps preview rendering deterministic for unknown public question types", () => {
    const steps = buildPublicSurveyPreviewSteps({
      schoolId: "school-1",
      title: "予備校下通り校",
      minCharCount: 120,
      maxCharCount: 280,
      questions: [
        {
          id: "q-unknown",
          type: "legacy-select",
          question: "未対応形式の設問",
          maxSelect: null,
          options: ["選択肢"],
          order: 1,
        },
      ],
    });

    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      id: "q-unknown",
      type: "TEXT",
      helperText: "120〜280文字を目安に入力",
    });
    expect(steps[0].maxSelect).toBeUndefined();
  });
});
