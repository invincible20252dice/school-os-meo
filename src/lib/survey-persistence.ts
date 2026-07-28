import type { ReviewStatus } from "@prisma/client";
import {
  buildScopedSchoolFilter,
  type RequestAccessResult,
} from "./supabase-access";
import type {
  SurveyEditorItem,
  SurveyEditorState,
  SurveyItemType,
} from "./survey-builder";

type SurveyPersistenceItemInput = {
  id?: string;
  type: SurveyItemType | string;
  question: string;
  maxSelect?: number | null;
  options?: string[];
  order: number;
};

export type SurveyPersistenceInput = {
  id?: string;
  schoolId?: string;
  title: string;
  requiredKeywords?: string;
  minCharCount?: number;
  maxCharCount?: number;
  isValid?: boolean;
  benefitType?: string;
  benefitShowTiming?: string;
  items: SurveyPersistenceItemInput[];
};

export type SurveyResponseInput = {
  schoolId: string;
  surveyId?: string;
  schoolName?: string;
  rating?: number;
  selectedReasons?: string[];
  freeText?: string;
  generatedReviews?: string[];
};

type PrismaSurveyPersistenceClient = {
  survey: {
    upsert(args: unknown): Promise<unknown>;
  };
  surveyItem: {
    deleteMany(args: unknown): Promise<unknown>;
    createMany(args: unknown): Promise<unknown>;
  };
  review: {
    create(args: unknown): Promise<unknown>;
  };
  school: {
    findUnique(args: unknown): Promise<unknown>;
  };
  $transaction<T>(operations: Promise<T>[]): Promise<T[]>;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeInteger(value: unknown, fallback: number) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.max(0, Math.trunc(numberValue));
}

function normalizeOptions(value: unknown) {
  return Array.isArray(value)
    ? value.map(normalizeString).filter(Boolean)
    : [];
}

export function normalizeSurveyPersistenceInput(
  input: SurveyPersistenceInput,
  accessResult: RequestAccessResult,
): SurveyEditorState {
  const scopedSchool = buildScopedSchoolFilter(accessResult.access, input.schoolId);
  const schoolId = scopedSchool.effectiveSchoolId || normalizeString(input.schoolId);

  if (!schoolId) {
    throw new Error("schoolId is required.");
  }

  const title = normalizeString(input.title);

  if (!title) {
    throw new Error("アンケート名を入力してください。");
  }

  const items = input.items.map((item, index): SurveyEditorItem => {
    const question = normalizeString(item.question);

    if (!question) {
      throw new Error(`${index + 1}番目の設問文を入力してください。`);
    }

    return {
      id: normalizeString(item.id) || `item-${index + 1}`,
      type: item.type as SurveyItemType,
      question,
      maxSelect:
        item.maxSelect === null || item.maxSelect === undefined
          ? undefined
          : normalizeInteger(item.maxSelect, 0),
      options: normalizeOptions(item.options),
      order: normalizeInteger(item.order, index + 1),
    };
  });

  if (items.length === 0) {
    throw new Error("設問を1件以上設定してください。");
  }

  return {
    id: normalizeString(input.id) || "new",
    schoolId,
    title,
    requiredKeywords: normalizeString(input.requiredKeywords),
    minCharCount: normalizeInteger(input.minCharCount, 100),
    maxCharCount: normalizeInteger(input.maxCharCount, 300),
    isValid: input.isValid ?? true,
    hasIncentive: Boolean(input.benefitType || input.benefitShowTiming),
    benefitType: normalizeString(input.benefitType),
    benefitShowTiming: normalizeString(input.benefitShowTiming),
    activeWeekdays: ["月", "火", "水", "木", "金"],
    items,
  };
}

export async function persistSurvey(
  prisma: PrismaSurveyPersistenceClient,
  survey: SurveyEditorState,
) {
  const surveyId = survey.id === "new" ? undefined : survey.id;
  const savedSurvey = await prisma.survey.upsert({
    where: { id: surveyId || `survey-${crypto.randomUUID()}` },
    update: {
      schoolId: survey.schoolId,
      title: survey.title,
      requiredKeywords: survey.requiredKeywords,
      minCharCount: survey.minCharCount,
      maxCharCount: survey.maxCharCount,
      isValid: survey.isValid,
      benefitType: survey.benefitType || null,
      benefitShowTiming: survey.benefitShowTiming || null,
    },
    create: {
      ...(surveyId ? { id: surveyId } : {}),
      schoolId: survey.schoolId,
      title: survey.title,
      requiredKeywords: survey.requiredKeywords,
      minCharCount: survey.minCharCount,
      maxCharCount: survey.maxCharCount,
      isValid: survey.isValid,
      benefitType: survey.benefitType || null,
      benefitShowTiming: survey.benefitShowTiming || null,
    },
  });
  const persistedSurvey = savedSurvey as { id: string };

  await prisma.$transaction([
    prisma.surveyItem.deleteMany({ where: { surveyId: persistedSurvey.id } }),
    prisma.surveyItem.createMany({
      data: survey.items.map((item) => ({
        surveyId: persistedSurvey.id,
        type: item.type,
        question: item.question,
        maxSelect: item.maxSelect || null,
        options: item.options,
        order: item.order,
      })),
    }),
  ]);

  return persistedSurvey;
}

export function normalizeSurveyResponseInput(input: SurveyResponseInput) {
  const schoolId = normalizeString(input.schoolId);

  if (!schoolId) {
    throw new Error("schoolId is required.");
  }

  return {
    schoolId,
    surveyId: normalizeString(input.surveyId),
    schoolName: normalizeString(input.schoolName),
    rating: normalizeInteger(input.rating, 0),
    selectedReasons: normalizeOptions(input.selectedReasons),
    freeText: normalizeString(input.freeText),
    generatedReviews: normalizeOptions(input.generatedReviews),
  };
}

export async function persistSurveyResponse(
  prisma: Pick<PrismaSurveyPersistenceClient, "review" | "school">,
  input: ReturnType<typeof normalizeSurveyResponseInput>,
) {
  const school = await prisma.school.findUnique({
    where: { id: input.schoolId },
    select: { id: true },
  });

  if (!school) {
    throw new Error("対象校舎が見つかりません。");
  }

  return prisma.review.create({
    data: {
      schoolId: input.schoolId,
      source: "SURVEY",
      status: "GENERATED" satisfies ReviewStatus,
      rating: input.rating || null,
      surveyAnswers: {
        surveyId: input.surveyId,
        schoolName: input.schoolName,
        selectedReasons: input.selectedReasons,
        freeText: input.freeText,
      },
      originalText: input.freeText || null,
      generatedPatterns: input.generatedReviews,
    },
  });
}
