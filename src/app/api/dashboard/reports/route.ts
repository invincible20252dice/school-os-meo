import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import {
  buildDashboardReportPayload,
  buildReportFromAggregates,
  DEFAULT_REPORT_SCHOOL_ID,
  getCurrentReportMonth,
  ISCHOOL_REPORT_BASELINE,
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
    const [report, latestReport, queries] = await Promise.all([
      month
        ? prisma.monthlyReport.findUnique({
            where: {
              schoolId_targetMonth: {
                schoolId,
                targetMonth: month,
              },
            },
          })
        : Promise.resolve(null),
      prisma.monthlyReport.findFirst({
        where: { schoolId },
        orderBy: { targetMonth: "desc" },
      }),
      prisma.searchQueryLog.findMany({
        where: month ? { schoolId, targetMonth: month } : { schoolId },
        orderBy: [{ targetMonth: "desc" }, { impressionCount: "desc" }],
        take: 50,
      }),
    ]);

    return {
      report: (report ?? latestReport) as DashboardReportRecord | null,
      queries: queries as DashboardQueryLogRecord[],
    };
  } catch (error) {
    if (!isMissingReportTableError(error)) {
      throw error;
    }

    console.error(
      "Monthly report tables are not available yet. Falling back to aggregate data.",
      error,
    );

    return {
      report: null,
      queries: [],
    };
  }
}

async function loadAggregateReportData(schoolId: string, month: string) {
  const monthStart = new Date(`${month}-01T00:00:00.000Z`);
  const monthEnd = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
  );

  try {
    const [reviews, keywords, aioScores, metrics] = await Promise.all([
      prisma.review.findMany({
        where: {
          schoolId,
          createdAt: {
            gte: monthStart,
            lt: monthEnd,
          },
        },
        select: { rating: true },
      }),
      prisma.targetKeyword.findMany({
        where: { schoolId, isActive: true },
        select: {
          id: true,
          rankHistories: {
            orderBy: { checkedAt: "desc" },
            take: 1,
            select: { rank: true },
          },
        },
      }),
      prisma.aioScoreHistory.findMany({
        where: {
          schoolId,
          checkedAt: {
            gte: monthStart,
            lt: monthEnd,
          },
        },
        orderBy: { checkedAt: "desc" },
        take: 20,
        select: { totalScore: true },
      }),
      prisma.gbpMetric.findMany({
        where: {
          schoolId,
          date: {
            gte: monthStart,
            lt: monthEnd,
          },
        },
        select: {
          views: true,
          searches: true,
          websiteClicks: true,
          phoneCalls: true,
          routeRequests: true,
        },
      }),
    ]);
    const reviewRatings = reviews
      .map((review) => review.rating)
      .filter((rating): rating is number => typeof rating === "number");
    const totalReviews = reviews.length;
    const averageRating =
      reviewRatings.length > 0
        ? reviewRatings.reduce((sum, rating) => sum + rating, 0) /
          reviewRatings.length
        : 0;
    const latestRanks = keywords
      .map((keyword) => keyword.rankHistories[0]?.rank)
      .filter((rank): rank is number => typeof rank === "number");
    const searchImpression = metrics.reduce(
      (sum, metric) => sum + metric.views + metric.searches,
      0,
    );
    const actionCount = metrics.reduce(
      (sum, metric) =>
        sum + metric.websiteClicks + metric.phoneCalls + metric.routeRequests,
      0,
    );

    return buildReportFromAggregates({
      month,
      totalReviews,
      averageRating,
      totalKeywordCount: keywords.length,
      top3KeywordCount: latestRanks.filter((rank) => rank <= 3).length,
      aioScores: aioScores.map((score) => score.totalScore),
      searchImpression,
      actionCount,
    });
  } catch (error) {
    if (!isMissingReportTableError(error)) {
      throw error;
    }

    console.error(
      "Aggregate report tables are not available yet. Using baseline report data.",
      error,
    );

    return null;
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
    const requestedMonth = url.searchParams.get("month")?.trim() || "";
    const month = requestedMonth || getCurrentReportMonth();
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true },
    });
    const { report: storedReport, queries } = await loadStoredReportData(
      schoolId,
      requestedMonth,
    );
    const aggregateReport = storedReport
      ? null
      : await loadAggregateReportData(schoolId, month);
    const report =
      storedReport ??
      aggregateReport ??
      (schoolId === DEFAULT_REPORT_SCHOOL_ID ? ISCHOOL_REPORT_BASELINE : null);
    const payload = buildDashboardReportPayload({
      school: school as DashboardReportSchoolRecord | null,
      report,
      queries,
      month: report?.targetMonth || month,
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
