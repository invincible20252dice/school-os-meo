import {
  DEFAULT_GOOGLE_REVIEW_URL,
  DEFAULT_PUBLIC_SCHOOL_NAME,
  resolveGoogleReviewUrl,
} from "@/lib/google-review-url";
import { prisma } from "@/lib/prisma";
import type { PublicSurveyQuestion } from "@/lib/public-survey-answers";
import { extractPublicSurveyQuestions } from "@/lib/public-survey-response";

function normalizeString(value: string | null | undefined) {
  return value?.trim() || "";
}

type PublicSurveyItemRow = {
  id: string;
  type: string;
  question: string;
  maxSelect: number | null;
  options: string[];
  order: number;
};

type PublicSurveySchoolRow = {
  id: string;
  name: string;
  googlePlaceId: string | null;
  googleMapsUrl: string | null;
  schoolSetting: {
    googleReviewUrl: string | null;
  } | null;
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

export const publicSurveyInclude = {
  items: {
    orderBy: { order: "asc" as const },
  },
  school: {
    select: {
      id: true,
      name: true,
      googlePlaceId: true,
      googleMapsUrl: true,
      schoolSetting: {
        select: {
          googleReviewUrl: true,
        },
      },
    },
  },
};

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
    placeholder: type === "text" ? "自由記述入力欄" : undefined,
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

  let survey = normalizedSurveyId
    ? ((await prisma.survey.findUnique({
        where: {
          id: normalizedSurveyId,
        },
        include: publicSurveyInclude,
      })) as PublicSurveyRow | null)
    : ((await prisma.survey.findFirst({
        where: {
          schoolId: normalizedSchoolId,
        },
        include: publicSurveyInclude,
        orderBy: [{ updatedAt: "desc" as const }, { createdAt: "desc" as const }],
      })) as PublicSurveyRow | null);

  if (!survey && normalizedSchoolId) {
    survey = (await prisma.survey.findFirst({
      where: {
        schoolId: normalizedSchoolId,
      },
      include: publicSurveyInclude,
      orderBy: [{ updatedAt: "desc" as const }, { createdAt: "desc" as const }],
    })) as PublicSurveyRow | null;
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
    return survey.school;
  }

  if (!normalizedSchoolId) {
    return null;
  }

  return prisma.school.findUnique({
    where: { id: normalizedSchoolId },
    select: {
      id: true,
      name: true,
      googlePlaceId: true,
      googleMapsUrl: true,
      schoolSetting: {
        select: {
          googleReviewUrl: true,
        },
      },
    },
  }) as Promise<PublicSurveySchoolRow | null>;
}

export async function buildPublicSurveyResponse({
  schoolId,
  surveyId,
}: {
  schoolId?: string | null;
  surveyId?: string | null;
}) {
  const normalizedSchoolId = normalizeString(schoolId);
  const survey = await findPublicSurvey({
    schoolId: normalizedSchoolId,
    surveyId,
  });
  const school = await findPublicSurveySchool({
    schoolId: normalizedSchoolId,
    survey,
  });

  if (!survey) {
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

  return {
    success: true,
    school: {
      id: responseSchool?.id || survey.schoolId || normalizedSchoolId,
      name: responseSchool?.name || DEFAULT_PUBLIC_SCHOOL_NAME,
    },
    schoolName: responseSchool?.name || DEFAULT_PUBLIC_SCHOOL_NAME,
    survey: serializedSurvey,
    questions,
    googleReviewUrl: resolveGoogleReviewUrl({
      settingReviewUrl: responseSchool?.schoolSetting?.googleReviewUrl,
      schoolGoogleMapsUrl: responseSchool?.googleMapsUrl,
      googlePlaceId: responseSchool?.googlePlaceId,
    }),
  };
}
