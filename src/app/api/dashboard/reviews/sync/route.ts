import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { GbpSyncError, syncGbpReviewsForSchool } from "@/lib/gbp-reviews-sync";
import { canAccessSchool } from "@/lib/auth-access";
import { prisma } from "@/lib/prisma";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

type SyncRequestBody = {
  schoolId?: string;
};
export const maxDuration = 300;

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

    if (!accessResult.isAuthenticated) {
      return NextResponse.json({ success: false, error: "ログイン後に同期してください。" }, { status: 401 });
    }
    if (!requestedSchoolId || requestedSchoolId === "all") {
      return NextResponse.json({ success: false, error: "同期する校舎を選択してください。" }, { status: 400 });
    }
    if (!canAccessSchool(accessResult.access, requestedSchoolId)) {
      return NextResponse.json({ success: false, error: "この校舎を同期する権限がありません。" }, { status: 403 });
    }

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
    if (error instanceof GbpSyncError) {
      console.error("[GBP Reviews Sync]", { status: error.status });
      return NextResponse.json({ success: false, error: error.message, code: "GOOGLE_SYNC_FAILED" }, { status: error.status });
    }
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
