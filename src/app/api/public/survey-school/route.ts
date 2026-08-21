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
  title: string;
  requiredKeywords: string | null;
  minCharCount: number;
  maxCharCount: number;
  benefitType: string | null;
  benefitShowTiming: string | null;
  items: PublicSurveyItemRow[];
};

const publicSurveySelect = {
  id: true,
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

    if (!schoolId) {
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

    const school = await prisma.school.findUnique({
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
    });

    if (!school) {
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

    const survey = (await prisma.survey.findFirst({
      where: surveyId
        ? {
            id: surveyId,
            isValid: true,
          }
        : {
            schoolId: school.id,
            isValid: true,
          },
      select: publicSurveySelect,
      orderBy: surveyId
        ? undefined
        : [{ updatedAt: "desc" as const }, { createdAt: "desc" as const }],
    })) as PublicSurveyRow | null;

    return NextResponse.json({
      school: {
        id: school.id,
        name: school.name,
      },
      survey: serializeSurvey(survey),
      googleReviewUrl: resolveGoogleReviewUrl({
        settingReviewUrl: school.schoolSetting?.googleReviewUrl,
        schoolGoogleMapsUrl: school.googleMapsUrl,
        googlePlaceId: school.googlePlaceId,
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
