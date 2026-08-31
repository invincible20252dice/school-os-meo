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
  school?: {
    id: string;
    name: string;
  } | null;
  items?: Array<{
    id: string;
    type: string;
    question: string;
    placeholder?: string | null;
    maxSelect: number | null;
    options: string[];
    order: number;
  }>;
};

function serializeSurvey(row: SurveyListRow) {
  const items = Array.isArray(row.items) ? row.items : [];

  return {
    id: row.id,
    schoolId: row.schoolId,
    schoolName: row.school?.name || "校舎名未設定",
    title: row.title || "無題のアンケート",
    requiredKeywords: row.requiredKeywords || "",
    minCharCount: row.minCharCount ?? 100,
    maxCharCount: row.maxCharCount ?? 300,
    isValid: row.isValid ?? true,
    isActive: row.isValid ?? true,
    hasIncentive: Boolean(row.benefitType || row.benefitShowTiming),
    benefitType: row.benefitType || "",
    benefitShowTiming: row.benefitShowTiming || "",
    itemCount: items.length,
    responseCount: 0,
    googleReviewUrl: "",
    minRatingForRedirect: 4,
    items: items.map((item) => ({
      id: item.id,
      type: item.type,
      question: item.question,
      placeholder: item.placeholder ?? null,
      maxSelect: item.maxSelect,
      options: item.options,
      order: item.order,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isMissingColumnError(error: unknown, columnName: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2022" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.includes(columnName)
  );
}

function buildSurveyListWhere({
  requestedSurveyId,
  shouldApplySchoolFilter,
  effectiveSchoolId,
}: {
  requestedSurveyId?: string;
  shouldApplySchoolFilter: boolean;
  effectiveSchoolId?: string;
}) {
  return {
    ...(shouldApplySchoolFilter && effectiveSchoolId
      ? { schoolId: effectiveSchoolId }
      : {}),
    ...(requestedSurveyId ? { id: requestedSurveyId } : {}),
  };
}

async function findSurveyListRows({
  where,
  includePlaceholder,
}: {
  where: Record<string, unknown>;
  includePlaceholder: boolean;
}) {
  return (await prisma.survey.findMany({
    where,
    include: {
      school: {
        select: {
          id: true,
          name: true,
        },
      },
      items: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          type: true,
          question: true,
          ...(includePlaceholder ? { placeholder: true } : {}),
          maxSelect: true,
          options: true,
          order: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  })) as SurveyListRow[];
}

async function findSurveySummaryRows(where: Record<string, unknown>) {
  return (await prisma.survey.findMany({
    where,
    select: {
      id: true,
      schoolId: true,
      title: true,
      requiredKeywords: true,
      minCharCount: true,
      maxCharCount: true,
      isValid: true,
      benefitType: true,
      benefitShowTiming: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  })) as SurveyListRow[];
}

function buildSurveyListAccessLabel(
  accessResult: Awaited<ReturnType<typeof resolveRequestAccess>>,
  scopedSchool: ReturnType<typeof buildScopedSchoolFilter>,
) {
  return {
    role: accessResult.access.role,
    effectiveSchoolId: scopedSchool.effectiveSchoolId || "all",
    requestedSchoolId: scopedSchool.requestedSchoolId,
    source: accessResult.access.source,
  };
}

async function resolveSurveyListAccess(request: Request, url: URL) {
  try {
    return {
      result: await resolveRequestAccess(request, url),
      error: null,
    };
  } catch (error) {
    console.error("[GET /api/surveys] Failed to resolve access.", error);

    return {
      result: null,
      error,
    };
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedSchoolId = url.searchParams.get("schoolId") || undefined;
    const requestedSurveyId =
      url.searchParams.get("id") || url.searchParams.get("surveyId") || undefined;
    const accessResolution = await resolveSurveyListAccess(request, url);

    if (!accessResolution.result) {
      return NextResponse.json({
        success: true,
        surveys: [],
        access: {
          role: "unknown",
          effectiveSchoolId: "unknown",
          requestedSchoolId: requestedSchoolId || "all",
          source: "unresolved",
        },
      });
    }

    const accessResult = accessResolution.result;

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
    const where = buildSurveyListWhere({
      requestedSurveyId,
      shouldApplySchoolFilter,
      effectiveSchoolId: scopedSchool.effectiveSchoolId,
    });
    let surveys: SurveyListRow[];

    try {
      surveys = await findSurveyListRows({ where, includePlaceholder: true });
    } catch (error) {
      if (isMissingColumnError(error, "SurveyItem.placeholder")) {
        console.error(
          "SurveyItem.placeholder is missing in the database. Run `npx prisma db push` to sync the schema.",
          error,
        );
        surveys = await findSurveyListRows({ where, includePlaceholder: false });
      } else {
        console.error(
          "[GET /api/surveys] Rich survey query failed. Retrying with Survey base columns only.",
          error,
        );
        surveys = await findSurveySummaryRows(where);
      }
    }

    return NextResponse.json({
      success: true,
      surveys: surveys.map(serializeSurvey),
      access: buildSurveyListAccessLabel(accessResult, scopedSchool),
    });
  } catch (error) {
    console.error("Failed to load survey settings list.", error);
    return NextResponse.json({
      success: true,
      surveys: [],
      access: {
        role: "admin",
        effectiveSchoolId: "all",
        requestedSchoolId: "all",
        source: "fallback",
      },
    });
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
