import type { SurveyEditorItem } from "./survey-builder";

export const RESPONDENT_QUESTION_ID = "system-respondent-type";
export const RESPONDENT_QUESTION_TITLE = "ご回答者様を選択してください";
export const RESPONDENT_OPTIONS = ["保護者様", "生徒ご本人様"] as const;
export type RespondentType = "PARENT" | "STUDENT";

export function withRespondentQuestion(items: SurveyEditorItem[]): SurveyEditorItem[] {
  return [
    { id: RESPONDENT_QUESTION_ID, type: "SINGLE_SELECT" as const, question: RESPONDENT_QUESTION_TITLE, options: [...RESPONDENT_OPTIONS], order: 1 },
    ...items.filter(item => item.id !== RESPONDENT_QUESTION_ID),
  ].map((item, index) => ({ ...item, order: index + 1 }));
}

export function requireRespondentType(answers: { questionId?: string; value?: unknown }[]): RespondentType {
  const selected = answers.filter(answer => answer.questionId === RESPONDENT_QUESTION_ID);
  if (selected.length !== 1 || !RESPONDENT_OPTIONS.some(option => option === selected[0].value)) {
    throw new Error("ご回答者様（保護者様 / 生徒ご本人様）を選択してください。");
  }
  return selected[0].value === "生徒ご本人様" ? "STUDENT" : "PARENT";
}
