import { NextResponse } from "next/server";
import {
  DEFAULT_GOOGLE_REVIEW_URL,
  DEFAULT_PUBLIC_SCHOOL_NAME,
  resolveGoogleReviewUrl,
} from "@/lib/google-review-url";
import { prisma } from "@/lib/prisma";
import {
  extractPublicSurveyQuestions,
} from "@/lib/public-survey-response";
import type { PublicSurveyQuestion } from "@/lib/public-survey-answers";

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
  school: {
    id: string;
    name: string;
    googlePlaceId: string | null;
    googleMapsUrl: string | null;
    schoolSetting: {
      googleReviewUrl: string | null;
    } | null;
  };
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

const publicSurveyInclude = {
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

function serializeSurvey(survey: PublicSurveyRow) {
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

export async function GET(request: Request) {
  let schoolId = "";

  try {
    const url = new URL(request.url);
    schoolId = normalizeString(url.searchParams.get("schoolId"));
    const surveyId =
      normalizeString(url.searchParams.get("surveyId")) ||
      normalizeString(url.searchParams.get("id"));

    if (!schoolId && !surveyId) {
      return NextResponse.json(
        {
          message: "校舎IDを指定してください。",
          success: false,
          school: {
            id: "",
            name: DEFAULT_PUBLIC_SCHOOL_NAME,
          },
          schoolName: DEFAULT_PUBLIC_SCHOOL_NAME,
          survey: null,
          questions: [],
          googleReviewUrl: DEFAULT_GOOGLE_REVIEW_URL,
        },
        { status: 400 },
      );
    }

    let survey = surveyId
      ? ((await prisma.survey.findUnique({
          where: {
            id: surveyId,
          },
          include: publicSurveyInclude,
        })) as PublicSurveyRow | null)
      : ((await prisma.survey.findFirst({
          where: {
            schoolId,
          },
          include: publicSurveyInclude,
          orderBy: [{ updatedAt: "desc" as const }, { createdAt: "desc" as const }],
        })) as PublicSurveyRow | null);

    if (!survey && schoolId) {
      survey = (await prisma.survey.findFirst({
        where: {
          schoolId,
        },
        include: publicSurveyInclude,
        orderBy: [{ updatedAt: "desc" as const }, { createdAt: "desc" as const }],
      })) as PublicSurveyRow | null;
    }

    const school = survey?.school || (schoolId
      ? await prisma.school.findUnique({
          where: { id: schoolId },
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
        })
      : null);

    if (!survey) {
      return NextResponse.json(
        {
          message: "アンケートが見つかりませんでした。",
          error: "Survey not found",
          success: false,
          school: {
            id: schoolId,
            name: school?.name || DEFAULT_PUBLIC_SCHOOL_NAME,
          },
          schoolName: school?.name || DEFAULT_PUBLIC_SCHOOL_NAME,
          survey: null,
          questions: [],
          googleReviewUrl: DEFAULT_GOOGLE_REVIEW_URL,
        },
        { status: 404 },
      );
    }

    const serializedSurvey = serializeSurvey(survey);
    const questions = serializedSurvey.questions;
    const responseSchool = school || survey?.school;

    return NextResponse.json({
      success: true,
      school: {
        id: responseSchool?.id || schoolId,
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
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        message: "アンケート公開設定を取得できませんでした。",
        success: false,
        school: {
          id: schoolId,
          name: DEFAULT_PUBLIC_SCHOOL_NAME,
        },
        schoolName: DEFAULT_PUBLIC_SCHOOL_NAME,
        survey: null,
        questions: [],
        googleReviewUrl: DEFAULT_GOOGLE_REVIEW_URL,
      },
      { status: 500 },
    );
  }
}
