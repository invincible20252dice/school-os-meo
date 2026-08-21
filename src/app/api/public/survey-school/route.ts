import { NextResponse } from "next/server";
import {
  DEFAULT_GOOGLE_REVIEW_URL,
  DEFAULT_PUBLIC_SCHOOL_NAME,
} from "@/lib/google-review-url";
import { buildPublicSurveyResponse } from "@/lib/public-survey-query";

function normalizeString(value: string | null | undefined) {
  return value?.trim() || "";
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

    const payload = await buildPublicSurveyResponse({ schoolId, surveyId });

    return NextResponse.json(payload, {
      status: payload.success ? 200 : 404,
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
