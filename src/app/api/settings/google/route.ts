import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

function toSettingResponse(setting: {
  id: string;
  schoolId: string;
  googleConnected: boolean;
  googleAccountId: string | null;
  googleRefreshToken: string | null;
  selectedGbpLocationId: string | null;
  updatedAt: Date;
}) {
  return {
    id: setting.id,
    schoolId: setting.schoolId,
    googleConnected: setting.googleConnected,
    googleAccountId: setting.googleAccountId || "",
    googleRefreshToken: setting.googleRefreshToken ? "********" : "",
    selectedGbpLocationId: setting.selectedGbpLocationId || "",
    updatedAt: setting.updatedAt.toISOString().slice(0, 16).replace("T", " "),
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedSchoolId = url.searchParams.get("schoolId") || undefined;
    const accessResult = await resolveRequestAccess(request, url);

    if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
      return NextResponse.json(
        { message: "アカウント承認後にGoogle連携設定を利用できます。" },
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
        { message: "Google連携設定を表示する校舎を選択してください。" },
        { status: 400 },
      );
    }

    const [school, setting] = await Promise.all([
      prisma.school.findUnique({
        where: { id: schoolId },
        select: {
          id: true,
          name: true,
          gbpAccountId: true,
          gbpLocationId: true,
        },
      }),
      prisma.schoolSetting.findUnique({
        where: { schoolId },
        select: {
          id: true,
          schoolId: true,
          googleConnected: true,
          googleAccountId: true,
          googleRefreshToken: true,
          selectedGbpLocationId: true,
          updatedAt: true,
        },
      }),
    ]);

    if (!school) {
      return NextResponse.json(
        { message: "対象校舎が見つかりませんでした。" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      school,
      setting: setting ? toSettingResponse(setting) : null,
      access: {
        role: accessResult.access.role,
        effectiveSchoolId: schoolId,
        source: accessResult.access.source,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "Google連携設定を取得できませんでした。" },
      { status: 500 },
    );
  }
}
