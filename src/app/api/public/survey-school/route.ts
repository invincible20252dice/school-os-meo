import { NextResponse } from "next/server";
import { DEFAULT_GOOGLE_REVIEW_URL, resolveGoogleReviewUrl } from "@/lib/google-review-url";
import { prisma } from "@/lib/prisma";

function normalizeString(value: string | null | undefined) {
  return value?.trim() || "";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const schoolId = normalizeString(url.searchParams.get("schoolId"));
    const surveyId = normalizeString(url.searchParams.get("surveyId"));

    if (!schoolId) {
      return NextResponse.json(
        {
          message: "校舎IDを指定してください。",
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
          googleReviewUrl: DEFAULT_GOOGLE_REVIEW_URL,
        },
        { status: 404 },
      );
    }

    const survey = surveyId
      ? await prisma.survey.findFirst({
          where: {
            id: surveyId,
            schoolId: school.id,
            isValid: true,
          },
          select: {
            id: true,
            title: true,
            requiredKeywords: true,
            minCharCount: true,
            maxCharCount: true,
            benefitType: true,
            benefitShowTiming: true,
            items: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                type: true,
                question: true,
                maxSelect: true,
                options: true,
                order: true,
              },
            },
          },
        })
      : null;

    return NextResponse.json({
      school: {
        id: school.id,
        name: school.name,
      },
      survey: survey
        ? {
            id: survey.id,
            title: survey.title,
            requiredKeywords: survey.requiredKeywords || "",
            minCharCount: survey.minCharCount,
            maxCharCount: survey.maxCharCount,
            benefitType: survey.benefitType || "",
            benefitShowTiming: survey.benefitShowTiming || "",
            items: survey.items.map((item) => ({
              id: item.id,
              type: item.type,
              question: item.question,
              maxSelect: item.maxSelect,
              options: item.options,
              order: item.order,
            })),
          }
        : null,
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
        googleReviewUrl: DEFAULT_GOOGLE_REVIEW_URL,
      },
      { status: 500 },
    );
  }
}
