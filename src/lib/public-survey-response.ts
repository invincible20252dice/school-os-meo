import type { PublicSurveyQuestion } from "./public-survey-answers";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : fallback;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeString).filter(Boolean);
}

function normalizeQuestionType(value: unknown): PublicSurveyQuestion["type"] {
  const type = normalizeString(value);

  if (["single", "SINGLE_SELECT", "SINGLE_CHOICE", "radio"].includes(type)) {
    return "SINGLE_SELECT";
  }

  if (["multiple", "MULTI_SELECT", "MULTIPLE_CHOICE", "checkbox"].includes(type)) {
    return "MULTI_SELECT";
  }

  return "TEXT";
}

function firstArray(...values: unknown[]) {
  return values.find(Array.isArray) as unknown[] | undefined;
}

export function normalizePublicSurveyQuestion(
  value: unknown,
  fallbackOrder: number,
): PublicSurveyQuestion | null {
  if (!isRecord(value)) {
    return null;
  }

  const question =
    normalizeString(value.question) ||
    normalizeString(value.title) ||
    normalizeString(value.questionText) ||
    normalizeString(value.label);

  if (!question) {
    return null;
  }

  const options = normalizeStringArray(
    firstArray(value.options, value.choices, value.items),
  );
  const maxSelect =
    value.maxSelect === null || value.maxSelect === undefined
      ? undefined
      : normalizeNumber(value.maxSelect, 0);

  return {
    id:
      normalizeString(value.id) ||
      normalizeString(value.questionId) ||
      `question-${fallbackOrder}`,
    type: normalizeQuestionType(value.internalType || value.questionType || value.type),
    question,
    maxSelect,
    options,
    order: normalizeNumber(value.order, fallbackOrder),
  };
}

export function extractPublicSurveyQuestions(response: unknown) {
  if (!isRecord(response)) {
    return [];
  }

  const survey = isRecord(response.survey) ? response.survey : {};
  const source =
    firstArray(
      response.questions,
      survey.questions,
      response.items,
      survey.items,
    ) || [];

  return source
    .map((item, index) => normalizePublicSurveyQuestion(item, index + 1))
    .filter((item): item is PublicSurveyQuestion => Boolean(item));
}

