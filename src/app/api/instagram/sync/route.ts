import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import { syncInstagramPosts } from "@/lib/instagram-sync";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedSchoolId = url.searchParams.get("schoolId") || undefined;
    const accessResult = await resolveRequestAccess(request, url);

    if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
      return NextResponse.json(
        { ok: false, message: "アカウント承認後にInstagram同期を実行できます。" },
        { status: 403 },
      );
    }

    const scopedSchool = buildScopedSchoolFilter(
      accessResult.access,
      requestedSchoolId,
    );
    const summary = await syncInstagramPosts({
      prisma,
      schoolId: scopedSchool.effectiveSchoolId,
    });

    return NextResponse.json({
      ok: true,
      message: "Instagram実同期を実行しました。",
      summary,
      access: {
        role: accessResult.access.role,
        effectiveSchoolId: scopedSchool.effectiveSchoolId || "",
        source: accessResult.access.source,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Instagram実同期に失敗しました。",
      },
      { status: 500 },
    );
  }
}
