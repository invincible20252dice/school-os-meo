import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { buildEmptySchoolSetting } from "@/lib/settings";
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
  googleReviewUrl: string | null;
  updatedAt: Date;
} | null, schoolId: string) {
  if (!setting) {
    const emptySetting = buildEmptySchoolSetting(schoolId);

    return {
      id: emptySetting.id,
      schoolId: emptySetting.schoolId,
      googleConnected: emptySetting.googleConnected,
      googleAccountId: emptySetting.googleAccountId,
      googleRefreshToken: emptySetting.googleRefreshToken,
      selectedGbpLocationId: emptySetting.selectedGbpLocationId,
      googleReviewUrl: emptySetting.googleReviewUrl,
      updatedAt: emptySetting.updatedAt,
    };
  }

  return {
    id: setting.id,
    schoolId: setting.schoolId,
    googleConnected: setting.googleConnected,
    googleAccountId: setting.googleAccountId || "",
    googleRefreshToken: setting.googleRefreshToken ? "********" : "",
    selectedGbpLocationId: setting.selectedGbpLocationId || "",
    googleReviewUrl: setting.googleReviewUrl || "",
    updatedAt: setting.updatedAt.toISOString().slice(0, 16).replace("T", " "),
  };
}

const googleSettingSelect = {
  id: true,
  schoolId: true,
  googleConnected: true,
  googleAccountId: true,
  googleRefreshToken: true,
  selectedGbpLocationId: true,
  googleReviewUrl: true,
  updatedAt: true,
};

const legacyGoogleSettingSelect = {
  ...googleSettingSelect,
  googleReviewUrl: false,
};

function isMissingColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes("does not exist") ||
    message.includes("Unknown column") ||
    message.includes("P2022")
  );
}

async function findGoogleSetting(schoolId: string) {
  try {
    return await prisma.schoolSetting.findUnique({
      where: { schoolId },
      select: googleSettingSelect,
    });
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    console.error("Google setting column lookup failed. Retrying without new optional columns.", error);
    const legacySetting = await prisma.schoolSetting.findUnique({
      where: { schoolId },
      select: legacyGoogleSettingSelect,
    });

    return legacySetting ? { ...legacySetting, googleReviewUrl: null } : null;
  }
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
      findGoogleSetting(schoolId),
    ]);

    if (!school) {
      return NextResponse.json(
        { message: "対象校舎が見つかりませんでした。" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      school,
      setting: toSettingResponse(setting, schoolId),
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
