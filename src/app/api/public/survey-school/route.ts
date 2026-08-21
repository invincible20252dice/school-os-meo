import { NextResponse } from "next/server";
import {
  DEFAULT_GOOGLE_REVIEW_URL,
  DEFAULT_PUBLIC_SCHOOL_NAME,
  resolveGoogleReviewUrl,
} from "@/lib/google-review-url";
import { prisma } from "@/lib/prisma";

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

function serializeSurveyItem(item: PublicSurveyItemRow) {
  const type = normalizeQuestionType(item.type);

  return {
    id: item.id,
    title: item.question,
    type,
    question: item.question,
    internalType: item.type,
    maxSelect: item.maxSelect,
    options: item.options,
    order: item.order,
    placeholder:
      type === "text"
        ? "自由記述入力欄"
        : undefined,
  };
}

function serializeSurvey(survey: PublicSurveyRow | null) {
  if (!survey) {
    return null;
  }

  const questions = survey.items.map(serializeSurveyItem);

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
    const surveyId = normalizeString(url.searchParams.get("surveyId"));

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

    const surveys = (await prisma.survey.findMany({
      where: surveyId
        ? {
            id: surveyId,
          }
        : {
            schoolId,
            isValid: true,
          },
      include: publicSurveyInclude,
      orderBy: [{ updatedAt: "desc" as const }, { createdAt: "desc" as const }],
      take: 1,
    })) as PublicSurveyRow[];
    const survey = surveys[0] || null;
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

    if (!school && !survey) {
      return NextResponse.json(
        {
          message: "対象校舎が見つかりませんでした。",
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
        { status: 404 },
      );
    }

    const serializedSurvey = serializeSurvey(survey);
    const questions = serializedSurvey?.questions || [];
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
