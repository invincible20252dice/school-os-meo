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

    return NextResponse.json({
      school: {
        id: school.id,
        name: school.name,
      },
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
