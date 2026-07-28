import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  normalizeSurveyResponseInput,
  persistSurveyResponse,
  type SurveyResponseInput,
} from "@/lib/survey-persistence";

export async function POST(request: Request) {
  try {
    const input = normalizeSurveyResponseInput(
      (await request.json()) as SurveyResponseInput,
    );
    const review = await persistSurveyResponse(prisma, input);

    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "アンケート回答を保存できませんでした。",
      },
      { status: 400 },
    );
  }
}
