import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  normalizeSurveyPersistenceInput,
  persistSurvey,
  toJapanesePersistenceError,
  type SurveyPersistenceInput,
} from "@/lib/survey-persistence";
import { resolveRequestAccess } from "@/lib/supabase-access";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const accessResult = await resolveRequestAccess(request, url);
    const input = (await request.json()) as SurveyPersistenceInput;
    const survey = normalizeSurveyPersistenceInput(input, accessResult);
    const savedSurvey = await persistSurvey(prisma, survey);

    return NextResponse.json(
      {
        survey: savedSurvey,
        access: {
          role: accessResult.access.role,
          effectiveSchoolId: survey.schoolId,
          source: accessResult.access.source,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message: toJapanesePersistenceError(
          error,
          "アンケート設定を保存できませんでした。入力内容を確認して再度お試しください。",
        ),
      },
      { status: 400 },
    );
  }
}
