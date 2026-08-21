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

const publicSurveySelect = {
  id: true,
  schoolId: true,
  title: true,
  requiredKeywords: true,
  minCharCount: true,
  maxCharCount: true,
  benefitType: true,
  benefitShowTiming: true,
  items: {
    orderBy: { order: "asc" as const },
    select: {
      id: true,
      type: true,
      question: true,
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
      schoolSetting: {
        select: {
          googleReviewUrl: true,
        },
      },
    },
  },
};

function serializeSurveyItem(item: PublicSurveyItemRow) {
  return {
    id: item.id,
    type: item.type,
    question: item.question,
    maxSelect: item.maxSelect,
    options: item.options,
    order: item.order,
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
    requiredKeywords: survey.requiredKeywords || "",
    minCharCount: survey.minCharCount,
    maxCharCount: survey.maxCharCount,
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
          school: {
            id: "",
            name: DEFAULT_PUBLIC_SCHOOL_NAME,
          },
          googleReviewUrl: DEFAULT_GOOGLE_REVIEW_URL,
        },
        { status: 400 },
      );
    }

    const survey = (await prisma.survey.findFirst({
      where: surveyId
        ? {
            id: surveyId,
          }
        : {
            schoolId,
            isValid: true,
          },
      select: publicSurveySelect,
      orderBy: surveyId
        ? undefined
        : [{ updatedAt: "desc" as const }, { createdAt: "desc" as const }],
    })) as PublicSurveyRow | null;
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
          school: {
            id: schoolId,
            name: DEFAULT_PUBLIC_SCHOOL_NAME,
          },
          googleReviewUrl: DEFAULT_GOOGLE_REVIEW_URL,
        },
        { status: 404 },
      );
    }

    const serializedSurvey = serializeSurvey(survey);
    const questions = serializedSurvey?.questions || [];
    const responseSchool = school || survey?.school;

    return NextResponse.json({
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
        school: {
          id: schoolId,
          name: DEFAULT_PUBLIC_SCHOOL_NAME,
        },
        googleReviewUrl: DEFAULT_GOOGLE_REVIEW_URL,
      },
      { status: 500 },
    );
  }
}
