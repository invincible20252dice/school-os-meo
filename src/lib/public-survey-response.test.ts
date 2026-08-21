import { describe, expect, it } from "vitest";
import {
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

  it("drops malformed question rows instead of creating empty rendered fields", () => {
    expect(
      [
        normalizePublicSurveyQuestion(null, 1),
        normalizePublicSurveyQuestion({ id: "q", type: "single" }, 2),
      ].filter(Boolean),
    ).toEqual([]);
  });
});

