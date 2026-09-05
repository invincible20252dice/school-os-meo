import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import {
  buildQueryAnalyticsPayload,
  DEFAULT_QUERY_ANALYTICS_SCHOOL_ID,
  type SearchQueryLogSource,
} from "@/lib/dashboard-query-analytics";
import { prisma } from "@/lib/prisma";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

function normalizeSchoolId(value: string | null) {
  const schoolId = value?.trim() || "";

  return schoolId === "all" ? "" : schoolId;
}

function isMissingSearchQueryTableError(error: unknown) {
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

async function loadQueryLogs(schoolId: string, month?: string) {
  try {
    const logs = await prisma.searchQueryLog.findMany({
      where: month ? { schoolId, targetMonth: month } : { schoolId },
      orderBy: [{ targetMonth: "desc" }, { impressionCount: "desc" }],
      take: 100,
    });

    const targetMonth = month || logs[0]?.targetMonth || "";
    const filteredLogs = month
      ? logs
      : logs.filter((log) => log.targetMonth === targetMonth);

    return {
      targetMonth,
      logs: filteredLogs as SearchQueryLogSource[],
    };
  } catch (error) {
    if (!isMissingSearchQueryTableError(error)) {
      throw error;
    }

    console.error(
      "SearchQueryLog table is not available yet. Returning empty query analytics.",
      error,
    );

    return {
      targetMonth: month || "",
      logs: [],
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
          error: "アカウント承認後に流入語句分析を確認できます。",
        },
        { status: 403 },
      );
    }

    const requestedSchoolId =
      normalizeSchoolId(url.searchParams.get("schoolId")) ||
      DEFAULT_QUERY_ANALYTICS_SCHOOL_ID;
    const scopedSchool = buildScopedSchoolFilter(
      accessResult.access,
      requestedSchoolId,
    );
    const schoolId = scopedSchool.effectiveSchoolId || requestedSchoolId;
    const requestedMonth = url.searchParams.get("month")?.trim() || "";
    const { targetMonth, logs } = await loadQueryLogs(
      schoolId,
      requestedMonth || undefined,
    );
    const payload = buildQueryAnalyticsPayload({
      schoolId,
      month: targetMonth || requestedMonth,
      logs,
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
    console.error("[GET /api/dashboard/analytics/queries Error]:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "流入語句分析を取得できませんでした。",
      },
      { status: 500 },
    );
  }
}
