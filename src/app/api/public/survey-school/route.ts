import { NextResponse } from "next/server";
import {
  DEFAULT_GOOGLE_REVIEW_URL,
  DEFAULT_PUBLIC_SCHOOL_NAME,
} from "@/lib/google-review-url";
import { buildPublicSurveyResponse } from "@/lib/public-survey-query";

function normalizeString(value: string | null | undefined) {
  return value?.trim() || "";
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code:
        "code" in error && typeof error.code === "string"
          ? error.code
          : undefined,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
    stack: undefined,
    code: undefined,
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

    console.log("[PublicSurveyAPI] request", {
      url: request.url,
      pathname: url.pathname,
      searchParams: Object.fromEntries(url.searchParams.entries()),
      schoolId,
      surveyId,
    });

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

    console.log("[PublicSurveyAPI] response", {
      status: payload.success ? 200 : 404,
      success: payload.success,
      schoolId: payload.school.id,
      schoolName: payload.schoolName,
      surveyId: payload.survey?.id || null,
      questionCount: payload.questions.length,
    });

    return NextResponse.json(payload, {
      status: payload.success ? 200 : 404,
    });
  } catch (error) {
    const serializedError = serializeError(error);
    console.error("[PublicSurveyAPI] error", serializedError);

    return NextResponse.json(
      {
        message: "アンケート公開設定を取得できませんでした。",
        success: false,
        error: serializedError.message,
        stack: serializedError.stack,
        code: serializedError.code,
        status: 500,
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
