import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { syncGbpReviewsForSchool } from "@/lib/gbp-reviews-sync";
import { prisma } from "@/lib/prisma";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

type SyncRequestBody = {
  schoolId?: string;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function readBody(request: Request) {
  try {
    return (await request.json()) as SyncRequestBody;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const body = await readBody(request);
    const requestedSchoolId =
      normalizeString(body.schoolId) ||
      normalizeString(url.searchParams.get("schoolId"));
    const accessResult = await resolveRequestAccess(request, url);

    if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
      return NextResponse.json(
        {
          success: false,
          error: "アカウント承認後にGoogle口コミ同期を実行できます。",
        },
        { status: 403 },
      );
    }

    const scopedSchool = buildScopedSchoolFilter(
      accessResult.access,
      requestedSchoolId,
    );
    const summary = await syncGbpReviewsForSchool({
      prisma,
      schoolId: scopedSchool.effectiveSchoolId,
    });

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[GBP Reviews Sync Error]:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Google口コミ一覧を同期できませんでした。";
    const status = message.includes("Google連携設定") ? 400 : 500;

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status },
    );
  }
}
