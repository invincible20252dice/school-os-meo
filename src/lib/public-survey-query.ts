import {
  DEFAULT_GOOGLE_REVIEW_URL,
  DEFAULT_PUBLIC_SCHOOL_NAME,
  resolveGoogleReviewUrl,
} from "@/lib/google-review-url";
import { prisma } from "@/lib/prisma";
import type { PublicSurveyQuestion } from "@/lib/public-survey-answers";
import { extractPublicSurveyQuestions } from "@/lib/public-survey-response";
import { getTextQuestionPlaceholder } from "@/lib/survey-builder";

function normalizeString(value: string | null | undefined) {
  return value?.trim() || "";
}

type PublicSurveyItemRow = {
  id: string;
  type: string;
  question: string;
  placeholder?: string | null;
  maxSelect: number | null;
  options: string[];
  order: number;
};

type PublicSurveySchoolRow = {
  id: string;
  name: string;
  googlePlaceId: string | null;
  googleMapsUrl: string | null;
};

type PublicSurveyRow = {
  id: string;
  schoolId: string;
  title: string;
  requiredKeywords: string | null;
  minCharCount: number;
  maxCharCount: number;
  benefitType: string | null;
  benefitShowTiming: string | null;
  items: PublicSurveyItemRow[];
  questions?: unknown;
  questionsJson?: unknown;
  surveyQuestions?: unknown;
  school?: PublicSurveySchoolRow | null;
};

function normalizeQuestionType(type: string) {
  if (type === "SINGLE_SELECT" || type === "SINGLE_CHOICE") {
    return "single";
  }

  if (type === "MULTI_SELECT" || type === "MULTIPLE_CHOICE") {
    return "multiple";
  }

  return "text";
}

export function buildPublicSurveyInclude(includePlaceholder = true) {
  return {
    items: {
      orderBy: { order: "asc" as const },
      select: {
        id: true,
        type: true,
        question: true,
        ...(includePlaceholder ? { placeholder: true } : {}),
        maxSelect: true,
        options: true,
        order: true,
      },
    },
    school: {
      select: {
        id: true,
        name: true,
        googlePlaceId: true,
        googleMapsUrl: true,
      },
    },
  };
}

export const publicSurveyInclude = buildPublicSurveyInclude(true);

function serializePublicSurveyQueryError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      code: "code" in error ? String(error.code) : undefined,
      name: error.name,
    };
  }

  return { message: String(error) };
}

function isMissingSurveyItemPlaceholderColumn(error: unknown) {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "";
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : String(error);

  return (
    (code === "P2022" || message.includes("P2022")) &&
    message.includes("SurveyItem.placeholder")
  );
}

function serializeNormalizedQuestion(item: PublicSurveyQuestion) {
  const type = normalizeQuestionType(item.type);

  return {
    id: item.id,
    title: item.question,
    type,
    question: item.question,
    internalType: item.type,
    maxSelect: item.maxSelect ?? null,
    options: item.options,
    order: item.order,
    placeholder:
      type === "text"
        ? getTextQuestionPlaceholder(item.question, item.placeholder)
        : undefined,
  };
}

export function serializePublicSurvey(survey: PublicSurveyRow) {
  const questions = extractPublicSurveyQuestions({ survey }).map(
    serializeNormalizedQuestion,
  );

  return {
    id: survey.id,
    title: survey.title,
    keywords: survey.requiredKeywords || "",
    requiredKeywords: survey.requiredKeywords || "",
    minChars: survey.minCharCount,
    maxChars: survey.maxCharCount,
    minCharCount: survey.minCharCount,
    maxCharCount: survey.maxCharCount,
    reward: survey.benefitType || "なし",
    benefitType: survey.benefitType || "",
    benefitShowTiming: survey.benefitShowTiming || "",
    items: questions,
    questions,
  };
}

async function findUniquePublicSurvey(id: string, includePlaceholder = true) {
  return (await prisma.survey.findUnique({
    where: {
      id,
    },
    include: buildPublicSurveyInclude(includePlaceholder),
  })) as PublicSurveyRow | null;
}

async function findFirstPublicSurveyBySchool(
  schoolId: string,
  includePlaceholder = true,
) {
  return (await prisma.survey.findFirst({
    where: {
      schoolId,
    },
    include: buildPublicSurveyInclude(includePlaceholder),
    orderBy: [{ updatedAt: "desc" as const }, { createdAt: "desc" as const }],
  })) as PublicSurveyRow | null;
}

async function findPublicSurveyWithPlaceholderFallback({
  schoolId,
  surveyId,
}: {
  schoolId: string;
  surveyId: string;
}) {
  try {
    return surveyId
      ? await findUniquePublicSurvey(surveyId, true)
      : await findFirstPublicSurveyBySchool(schoolId, true);
  } catch (error) {
    if (!isMissingSurveyItemPlaceholderColumn(error)) {
      throw error;
    }

    console.warn(
      "[PublicSurveyQuery] SurveyItem.placeholder is missing. Retrying public survey lookup without the optional column.",
      {
        schoolId,
        surveyId,
        error: serializePublicSurveyQueryError(error),
      },
    );

    return surveyId
      ? await findUniquePublicSurvey(surveyId, false)
      : await findFirstPublicSurveyBySchool(schoolId, false);
  }
}

export type SerializedPublicSurveyResponse = Awaited<
  ReturnType<typeof buildPublicSurveyResponse>
>;

export async function findPublicSurvey({
  schoolId,
  surveyId,
}: {
  schoolId?: string | null;
  surveyId?: string | null;
}) {
  const normalizedSchoolId = normalizeString(schoolId);
  const normalizedSurveyId = normalizeString(surveyId);

  console.log("[PublicSurveyQuery] findPublicSurvey:start", {
    schoolId: normalizedSchoolId,
    surveyId: normalizedSurveyId,
    mode: normalizedSurveyId ? "findUnique" : "findFirstBySchool",
  });

  let survey = await findPublicSurveyWithPlaceholderFallback({
    schoolId: normalizedSchoolId,
    surveyId: normalizedSurveyId,
  });

  console.log("[PublicSurveyQuery] findPublicSurvey:primaryResult", {
    found: Boolean(survey),
    surveyId: survey?.id || null,
    surveySchoolId: survey?.schoolId || null,
    title: survey?.title || null,
    itemCount: survey?.items?.length ?? null,
    hasJoinedSchool: Boolean(survey?.school),
  });

  if (!survey && normalizedSchoolId) {
    survey = await findPublicSurveyWithPlaceholderFallback({
      schoolId: normalizedSchoolId,
      surveyId: "",
    });

    console.log("[PublicSurveyQuery] findPublicSurvey:fallbackResult", {
      found: Boolean(survey),
      schoolId: normalizedSchoolId,
      surveyId: survey?.id || null,
      title: survey?.title || null,
      itemCount: survey?.items?.length ?? null,
      hasJoinedSchool: Boolean(survey?.school),
    });
  }

  return survey;
}

export async function findPublicSurveySchool({
  schoolId,
  survey,
}: {
  schoolId?: string | null;
  survey: PublicSurveyRow | null;
}) {
  const normalizedSchoolId = normalizeString(schoolId);

  if (survey?.school) {
    console.log("[PublicSurveyQuery] findPublicSurveySchool:joinedSchool", {
      schoolId: survey.school.id,
      schoolName: survey.school.name,
    });
    return survey.school;
  }

  if (!normalizedSchoolId) {
    console.log("[PublicSurveyQuery] findPublicSurveySchool:skipped", {
      reason: "schoolId is empty",
    });
    return null;
  }

  const school = await prisma.school.findUnique({
    where: { id: normalizedSchoolId },
    select: {
      id: true,
      name: true,
      googlePlaceId: true,
      googleMapsUrl: true,
    },
  }) as PublicSurveySchoolRow | null;

  console.log("[PublicSurveyQuery] findPublicSurveySchool:lookupResult", {
    found: Boolean(school),
    schoolId: normalizedSchoolId,
    schoolName: school?.name || null,
  });

  return school;
}

export async function findSchoolSettingGoogleReviewUrl(schoolId?: string | null) {
  const normalizedSchoolId = normalizeString(schoolId);

  if (!normalizedSchoolId) {
    console.log("[PublicSurveyQuery] findSchoolSettingGoogleReviewUrl:skipped", {
      reason: "schoolId is empty",
    });
    return null;
  }

  try {
    const setting = await prisma.schoolSetting.findUnique({
      where: { schoolId: normalizedSchoolId },
      select: {
        googleReviewUrl: true,
      },
    });

    console.log("[PublicSurveyQuery] findSchoolSettingGoogleReviewUrl:result", {
      schoolId: normalizedSchoolId,
      found: Boolean(setting),
      hasGoogleReviewUrl: Boolean(setting?.googleReviewUrl),
    });

    return setting?.googleReviewUrl || null;
  } catch (error) {
    console.error("[PublicSurveyQuery] findSchoolSettingGoogleReviewUrl:error", {
      schoolId: normalizedSchoolId,
      error: serializePublicSurveyQueryError(error),
    });

    return null;
  }
}

export async function buildPublicSurveyResponse({
  schoolId,
  surveyId,
}: {
  schoolId?: string | null;
  surveyId?: string | null;
}) {
  const normalizedSchoolId = normalizeString(schoolId);
  console.log("[PublicSurveyQuery] buildPublicSurveyResponse:start", {
    schoolId: normalizedSchoolId,
    surveyId: normalizeString(surveyId),
  });

  const survey = await findPublicSurvey({
    schoolId: normalizedSchoolId,
    surveyId,
  });
  const school = await findPublicSurveySchool({
    schoolId: normalizedSchoolId,
    survey,
  });

  if (!survey) {
    console.log("[PublicSurveyQuery] buildPublicSurveyResponse:notFound", {
      schoolId: normalizedSchoolId,
      schoolName: school?.name || null,
    });

    return {
      success: false,
      message: "アンケートが見つかりませんでした。",
      error: "Survey not found",
      school: {
        id: normalizedSchoolId,
        name: school?.name || DEFAULT_PUBLIC_SCHOOL_NAME,
      },
      schoolName: school?.name || DEFAULT_PUBLIC_SCHOOL_NAME,
      survey: null,
      questions: [],
      googleReviewUrl: DEFAULT_GOOGLE_REVIEW_URL,
    };
  }

  const serializedSurvey = serializePublicSurvey(survey);
  const questions = serializedSurvey.questions;
  const responseSchool = school || survey.school;
  const responseSchoolId = responseSchool?.id || survey.schoolId || normalizedSchoolId;
  const settingReviewUrl = await findSchoolSettingGoogleReviewUrl(responseSchoolId);

  console.log("[PublicSurveyQuery] buildPublicSurveyResponse:success", {
    schoolId: responseSchoolId,
    schoolName: responseSchool?.name || DEFAULT_PUBLIC_SCHOOL_NAME,
    surveyId: serializedSurvey.id,
    title: serializedSurvey.title,
    questionCount: questions.length,
    questionTitles: questions.map((question) => question.title),
  });

  return {
    success: true,
    school: {
      id: responseSchoolId,
      name: responseSchool?.name || DEFAULT_PUBLIC_SCHOOL_NAME,
    },
    schoolName: responseSchool?.name || DEFAULT_PUBLIC_SCHOOL_NAME,
    survey: serializedSurvey,
    questions,
    googleReviewUrl: resolveGoogleReviewUrl({
      settingReviewUrl,
      schoolGoogleMapsUrl: responseSchool?.googleMapsUrl,
      googlePlaceId: responseSchool?.googlePlaceId,
    }),
  };
}
