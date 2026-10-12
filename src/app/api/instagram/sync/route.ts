import { NextResponse } from "next/server";
import { canAccessSchool, canSwitchSchool } from "@/lib/auth-access";
import { RequestAuthenticationError } from "@/lib/request-authentication-error";
import { isApprovedAccess } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import { syncInstagramPosts } from "@/lib/instagram-sync";
import { resolveRequestAccess } from "@/lib/supabase-access";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedSchoolId = url.searchParams.get("schoolId")?.trim() || undefined;
    const accessResult = await resolveRequestAccess(request, url, undefined, {
      requireActiveProfile: true,
    });

    if (!accessResult.isAuthenticated) {
      return NextResponse.json({ ok: false, message: "ログインしてください。" }, { status: 401 });
    }

    if (!isApprovedAccess(accessResult.access)) {
      return NextResponse.json(
        { ok: false, message: "アカウント承認後にInstagram同期を実行できます。" },
        { status: 403 },
      );
    }

    // Preserve existing all-school operation only for active all-school roles.
    const allSchoolsAllowed = canSwitchSchool(accessResult.access);
    if (!requestedSchoolId && !allSchoolsAllowed) {
      return NextResponse.json({ ok: false, message: "同期する校舎を選択してください。" }, { status: 400 });
    }
    if ((requestedSchoolId === "all" && !allSchoolsAllowed) ||
        (requestedSchoolId && requestedSchoolId !== "all" && !canAccessSchool(accessResult.access, requestedSchoolId))) {
      return NextResponse.json({ ok: false, message: "この校舎のInstagram同期は実行できません。" }, { status: 403 });
    }
    // Do not coerce an explicitly authorized school to a manager's default school.
    const schoolId = requestedSchoolId === "all" ? undefined : requestedSchoolId;
    const summary = await syncInstagramPosts({
      prisma,
      schoolId,
    });

    return NextResponse.json({
      ok: true,
      message: "Instagram実同期を実行しました。",
      summary,
      access: {
        role: accessResult.access.role,
        effectiveSchoolId: schoolId || "",
        source: accessResult.access.source,
      },
    });
  } catch (error) {
    const status = error instanceof RequestAuthenticationError ? 401 : 500;
    if (status === 500) console.error("Instagram manual sync failed.");
    return NextResponse.json(
      {
        ok: false,
        message:
          status === 401 ? "ログインしてください。" : "Instagram実同期に失敗しました。",
      },
      { status },
    );
  }
}
