import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import {
  buildDashboardReportPayload,
  DEFAULT_REPORT_SCHOOL_ID,
  getCurrentReportMonth,
  type DashboardQueryLogRecord,
  type DashboardReportRecord,
  type DashboardReportSchoolRecord,
} from "@/lib/dashboard-reports";
import { prisma } from "@/lib/prisma";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

function normalizeSchoolId(value: string | null) {
  const schoolId = value?.trim() || "";

  return schoolId === "all" ? "" : schoolId;
}

function isMissingReportTableError(error: unknown) {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "";
  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);

  return (
    code === "P2021" ||
    code === "P2022" ||
    message.includes("does not exist") ||
    message.includes("Unknown column") ||
    message.includes("P2021") ||
    message.includes("P2022")
  );
}

async function loadStoredReportData(schoolId: string, month: string) {
  try {
    const [report, queries] = await Promise.all([
      prisma.monthlyReport.findUnique({
        where: {
          schoolId_targetMonth: {
            schoolId,
            targetMonth: month,
          },
        },
      }),
      prisma.searchQueryLog.findMany({
        where: { schoolId, targetMonth: month },
        orderBy: { impressionCount: "desc" },
      }),
    ]);

    return {
      report: report as DashboardReportRecord | null,
      queries: queries as DashboardQueryLogRecord[],
    };
  } catch (error) {
    if (!isMissingReportTableError(error)) {
      throw error;
    }

    console.error(
      "Monthly report tables are not available yet. Returning empty report data.",
      error,
    );

    return {
      report: null,
      queries: [],
    };
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const accessResult = await resolveRequestAccess(request, url);

    if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
      return NextResponse.json(
        {
          success: false,
          error: "アカウント承認後にレポートを確認できます。",
        },
        { status: 403 },
      );
    }

    const requestedSchoolId =
      normalizeSchoolId(url.searchParams.get("schoolId")) ||
      DEFAULT_REPORT_SCHOOL_ID;
    const scopedSchool = buildScopedSchoolFilter(
      accessResult.access,
      requestedSchoolId,
    );
    const schoolId = scopedSchool.effectiveSchoolId || requestedSchoolId;
    const month = url.searchParams.get("month")?.trim() || getCurrentReportMonth();
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true },
    });
    const { report, queries } = await loadStoredReportData(schoolId, month);
    const payload = buildDashboardReportPayload({
      school: school as DashboardReportSchoolRecord | null,
      report,
      queries,
      month,
    });

    return NextResponse.json({
      success: true,
      ...payload,
      access: {
        role: accessResult.access.role,
        effectiveSchoolId: schoolId,
        source: accessResult.access.source,
      },
    });
  } catch (error) {
    console.error("[GET /api/dashboard/reports Error]:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "レポートデータを取得できませんでした。",
      },
      { status: 500 },
    );
  }
}
