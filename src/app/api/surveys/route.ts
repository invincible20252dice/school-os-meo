import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import {
  normalizeSurveyPersistenceInput,
  persistSurvey,
  toJapanesePersistenceError,
  type SurveyPersistenceInput,
} from "@/lib/survey-persistence";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

type SurveyListRow = {
  id: string;
  schoolId: string;
  title: string;
  requiredKeywords: string | null;
  minCharCount: number;
  maxCharCount: number;
  isValid: boolean;
  benefitType: string | null;
  benefitShowTiming: string | null;
  createdAt: Date;
  updatedAt: Date;
  school: {
    id: string;
    name: string;
  };
  items: Array<{
    id: string;
    type: string;
    question: string;
    maxSelect: number | null;
    options: string[];
    order: number;
  }>;
};

function serializeSurvey(row: SurveyListRow) {
  return {
    id: row.id,
    schoolId: row.schoolId,
    schoolName: row.school.name,
    title: row.title,
    requiredKeywords: row.requiredKeywords || "",
    minCharCount: row.minCharCount,
    maxCharCount: row.maxCharCount,
    isValid: row.isValid,
    hasIncentive: Boolean(row.benefitType || row.benefitShowTiming),
    benefitType: row.benefitType || "",
    benefitShowTiming: row.benefitShowTiming || "",
    itemCount: row.items.length,
    items: row.items.map((item) => ({
      id: item.id,
      type: item.type,
      question: item.question,
      maxSelect: item.maxSelect,
      options: item.options,
      order: item.order,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedSchoolId = url.searchParams.get("schoolId") || undefined;
    const requestedSurveyId =
      url.searchParams.get("id") || url.searchParams.get("surveyId") || undefined;
    const accessResult = await resolveRequestAccess(request, url);

    if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
      return NextResponse.json(
        { message: "アカウント承認後にアンケート設定を閲覧できます。" },
        { status: 403 },
      );
    }

    const scopedSchool = buildScopedSchoolFilter(
      accessResult.access,
      requestedSchoolId,
    );
    const shouldApplySchoolFilter =
      !requestedSurveyId || !scopedSchool.canSwitchSchool;
    const surveys = (await prisma.survey.findMany({
      where: {
        ...(shouldApplySchoolFilter && scopedSchool.effectiveSchoolId
          ? { schoolId: scopedSchool.effectiveSchoolId }
          : {}),
        ...(requestedSurveyId ? { id: requestedSurveyId } : {}),
      },
      include: {
        school: {
          select: {
            id: true,
            name: true,
          },
        },
        items: {
          orderBy: { order: "asc" },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    })) as SurveyListRow[];

    return NextResponse.json({
      surveys: surveys.map(serializeSurvey),
      access: {
        role: accessResult.access.role,
        effectiveSchoolId: scopedSchool.effectiveSchoolId || "all",
        requestedSchoolId: scopedSchool.requestedSchoolId,
        source: accessResult.access.source,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "アンケート設定一覧を取得できませんでした。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const accessResult = await resolveRequestAccess(request, url);

    if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
      return NextResponse.json(
        { message: "アカウント承認後にアンケート設定を保存できます。" },
        { status: 403 },
      );
    }

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
