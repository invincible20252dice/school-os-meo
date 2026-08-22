import type { PublicSurveyQuestion } from "./public-survey-answers";
import {
  buildSurveyPreviewSteps,
  type SurveyEditorState,
} from "./survey-builder";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseJsonArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : fallback;
}

function normalizeStringArray(value: unknown) {
  const arrayValue = parseJsonArray(value);

  if (!arrayValue) {
    return [];
  }

  return arrayValue.map(normalizeString).filter(Boolean);
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

function firstQuestionArray(...values: unknown[]) {
  for (const value of values) {
    const arrayValue = parseJsonArray(value);

    if (arrayValue) {
      return arrayValue;
    }
  }

  return undefined;
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
    firstQuestionArray(value.options, value.choices, value.items),
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
    firstQuestionArray(
      response.questions,
      response.questionsJson,
      survey.questions,
      survey.questionsJson,
      response.surveyQuestions,
      survey.surveyQuestions,
      response.items,
      survey.items,
    ) || [];

  return source
    .map((item, index) => normalizePublicSurveyQuestion(item, index + 1))
    .filter((item): item is PublicSurveyQuestion => Boolean(item));
}

export function buildPublicSurveyPreviewSteps({
  questions,
  title,
  schoolId,
  minCharCount,
  maxCharCount,
}: {
  questions: PublicSurveyQuestion[];
  title: string;
  schoolId: string;
  minCharCount: number;
  maxCharCount: number;
}) {
  const survey: SurveyEditorState = {
    id: "public-survey",
    schoolId,
    title,
    requiredKeywords: "",
    minCharCount,
    maxCharCount,
    isValid: true,
    hasIncentive: false,
    benefitType: "",
    benefitShowTiming: "",
    activeWeekdays: ["月", "火", "水", "木", "金"],
    items: [...questions]
      .sort((a, b) => a.order - b.order)
      .map((question) => ({
        id: question.id,
        type:
          question.type === "SINGLE_SELECT" ||
          question.type === "MULTI_SELECT" ||
          question.type === "TEXT"
            ? question.type
            : "TEXT",
        question: question.question,
        maxSelect:
          question.maxSelect === null || question.maxSelect === undefined
            ? undefined
            : question.maxSelect,
        options: question.options,
        order: question.order,
      })),
  };

  return buildSurveyPreviewSteps(survey);
}
