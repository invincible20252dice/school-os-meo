import { describe, expect, it } from "vitest";
import { requireRespondentType, withRespondentQuestion, RESPONDENT_QUESTION_ID } from "./survey-respondent";
import type { SurveyEditorItem } from "./survey-builder";

describe("fixed respondent question", () => {
  it("prepends Q1 without changing legacy questions or their IDs", () => {
    const items: SurveyEditorItem[] = [{ id: "q1", type: "TEXT", question: "高校はどこですか？", options: [], order: 1 }];
    const result = withRespondentQuestion(items);
    expect(result).toEqual([
      { id: RESPONDENT_QUESTION_ID, type: "SINGLE_SELECT", question: "ご回答者様を選択してください", options: ["保護者様", "生徒ご本人様"], order: 1 },
      { ...items[0], order: 2 },
    ]);
    expect(items[0].order).toBe(1);
    expect(withRespondentQuestion(result)).toEqual(result);
    expect(withRespondentQuestion([{ ...result[0], question: "changed", options: ["other"] }])[0]).toEqual(result[0]);
  });
  it.each([["保護者様", "PARENT"], ["生徒ご本人様", "STUDENT"]])("requires an explicit %s selection", (value, type) => {
    expect(requireRespondentType([{ questionId: RESPONDENT_QUESTION_ID, value }])).toBe(type);
  });
  it.each([[], [{ value: "生徒ご本人様" }], [{ questionId: RESPONDENT_QUESTION_ID, value: "" }], [{ questionId: RESPONDENT_QUESTION_ID, value: ["保護者様"] }], [{ questionId: RESPONDENT_QUESTION_ID, value: "生徒ご本人様" }, { questionId: RESPONDENT_QUESTION_ID, value: "保護者様" }]].map(answers => ({ answers })))("rejects absent, malformed or duplicate identity %#", ({ answers }) => {
    expect(() => requireRespondentType(answers)).toThrow("ご回答者様");
  });
});
