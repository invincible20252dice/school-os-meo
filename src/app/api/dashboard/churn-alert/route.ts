import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import {
  assertChurnAlertStatus,
  buildChurnAlertSummary,
  normalizeChurnAlerts,
  type ChurnAlertSource,
} from "@/lib/churn-alerts";
import { prisma } from "@/lib/prisma";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

function isMissingChurnAlertTableError(error: unknown) {
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
      : String(error);

  return (
    code === "P2021" ||
    code === "P2022" ||
    message.includes("ChurnAlert") ||
    message.includes("churnAlert") ||
    message.includes("does not exist") ||
    message.includes("Unknown column")
  );
}

async function resolveSchoolId(request: Request) {
  const url = new URL(request.url);
  const accessResult = await resolveRequestAccess(request, url);

  if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
    return {
      accessResult,
      error: NextResponse.json(
        { success: false, error: "アカウント承認後に退塾防止アラートを確認できます。" },
        { status: 403 },
      ),
      schoolId: "",
    };
  }

  const scopedSchool = buildScopedSchoolFilter(
    accessResult.access,
    url.searchParams.get("schoolId"),
  );

  return {
    accessResult,
    error: null,
    schoolId: scopedSchool.effectiveSchoolId || scopedSchool.requestedSchoolId,
  };
}

export async function GET(request: Request) {
  try {
    const { accessResult, error, schoolId } = await resolveSchoolId(request);

    if (error) {
      return error;
    }

    const rows = await prisma.churnAlert.findMany({
      where: schoolId ? { schoolId } : undefined,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    const alerts = normalizeChurnAlerts(rows as ChurnAlertSource[]);

    return NextResponse.json({
      success: true,
      summary: buildChurnAlertSummary(alerts),
      alerts,
      access: {
        role: accessResult.access.role,
        effectiveSchoolId: schoolId,
        source: accessResult.access.source,
      },
    });
  } catch (error) {
    console.error("[GET /api/dashboard/churn-alert Error]:", error);

    if (isMissingChurnAlertTableError(error)) {
      return NextResponse.json({
        success: true,
        summary: buildChurnAlertSummary([]),
        alerts: [],
      });
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "退塾防止アラートを取得できませんでした。",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const url = new URL(request.url);
    const accessResult = await resolveRequestAccess(request, url);

    if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
      return NextResponse.json(
        { success: false, error: "アカウント承認後に退塾防止アラートを更新できます。" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const alertId = typeof body.alertId === "string" ? body.alertId.trim() : "";
    const status = assertChurnAlertStatus(body.status);

    if (!alertId) {
      return NextResponse.json(
        { success: false, error: "alertId is required" },
        { status: 400 },
      );
    }

    const updateData = {
      status,
      resolvedAt: status === "RESOLVED" ? new Date() : null,
    };
    const updated = await prisma.churnAlert.update({
      where: { id: alertId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      alert: normalizeChurnAlerts([updated as ChurnAlertSource])[0],
    });
  } catch (error) {
    console.error("[PATCH /api/dashboard/churn-alert Error]:", error);
    const message =
      error instanceof Error ? error.message : "退塾防止アラートを更新できませんでした。";
    const status = message.includes("ステータス") || message.includes("alertId") ? 400 : 500;

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status },
    );
  }
}
