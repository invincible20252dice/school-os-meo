import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import {
  fetchGbpAccounts,
  fetchGbpLocationsForAccounts,
  refreshGoogleAccessToken,
} from "@/lib/google-gbp-oauth";
import { prisma } from "@/lib/prisma";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedSchoolId = url.searchParams.get("schoolId") || undefined;
    const accessResult = await resolveRequestAccess(request, url);

    if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
      return NextResponse.json(
        { message: "アカウント承認後にGBP店舗一覧を取得できます。" },
        { status: 403 },
      );
    }

    const scopedSchool = buildScopedSchoolFilter(
      accessResult.access,
      requestedSchoolId,
    );
    const schoolId = scopedSchool.effectiveSchoolId || requestedSchoolId;

    if (!schoolId) {
      return NextResponse.json(
        { message: "GBP店舗一覧を取得する校舎を選択してください。" },
        { status: 400 },
      );
    }

    const setting = await prisma.schoolSetting.findUnique({
      where: { schoolId },
      select: {
        googleRefreshToken: true,
        selectedGbpLocationId: true,
      },
    });

    if (!setting?.googleRefreshToken) {
      return NextResponse.json(
        { message: "Googleアカウント連携を先に完了してください。" },
        { status: 400 },
      );
    }

    const accessToken = await refreshGoogleAccessToken({
      refreshToken: setting.googleRefreshToken,
    });
    const accounts = await fetchGbpAccounts({ accessToken });
    const locations = await fetchGbpLocationsForAccounts({
      accessToken,
      accounts,
    });

    return NextResponse.json({
      accounts,
      locations,
      selectedGbpLocationId: setting.selectedGbpLocationId || "",
      access: {
        role: accessResult.access.role,
        effectiveSchoolId: schoolId,
        source: accessResult.access.source,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "Google Business Profileの店舗一覧を取得できませんでした。" },
      { status: 500 },
    );
  }
}
