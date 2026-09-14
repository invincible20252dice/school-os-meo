import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { buildEmptySchoolSetting } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

type GoogleSettingPayload = {
  schoolId?: string;
  accountName?: string;
  googleAccountId?: string;
  email?: string;
  locationName?: string;
  locationId?: string;
  selectedGbpLocationId?: string;
  reviewUrl?: string;
  googleReviewUrl?: string;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLocationId(value: unknown) {
  const locationId = normalizeString(value).replace(/^\/+|\/+$/g, "");

  if (!locationId) {
    return "";
  }

  if (locationId.startsWith("accounts/") && locationId.includes("/locations/")) {
    return `locations/${locationId.split("/locations/").pop()}`;
  }

  return locationId.startsWith("locations/")
    ? locationId
    : `locations/${locationId}`;
}

function toAccountResponse(setting: ReturnType<typeof toSettingResponse>) {
  return {
    schoolId: setting.schoolId,
    email: setting.googleAccountId,
    googleAccountId: setting.googleAccountId,
    locationId: setting.selectedGbpLocationId,
    reviewUrl: setting.googleReviewUrl,
    status: setting.googleConnected ? "CONNECTED" : "DISCONNECTED",
    updatedAt: setting.updatedAt,
  };
}

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
    code === "P2022" ||
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

    const serializedSetting = toSettingResponse(setting, schoolId);

    return NextResponse.json({
      success: true,
      school,
      setting: serializedSetting,
      account: toAccountResponse(serializedSetting),
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

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const accessResult = await resolveRequestAccess(request, url);

    if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
      return NextResponse.json(
        { message: "アカウント承認後にGoogle連携設定を保存できます。" },
        { status: 403 },
      );
    }

    const body = (await request.json()) as GoogleSettingPayload;
    const requestedSchoolId = normalizeString(body.schoolId);
    const selectedGbpLocationId = normalizeLocationId(
      body.selectedGbpLocationId || body.locationId || body.locationName,
    );
    const googleAccountId = normalizeString(
      body.googleAccountId || body.accountName || body.email,
    );
    const hasReviewUrl = "googleReviewUrl" in body || "reviewUrl" in body;
    const googleReviewUrl = normalizeString(
      body.googleReviewUrl ?? body.reviewUrl,
    );

    if (!requestedSchoolId || !selectedGbpLocationId) {
      return NextResponse.json(
        { message: "校舎とGBPロケーションIDを入力してください。" },
        { status: 400 },
      );
    }

    if (googleReviewUrl && !/^https:\/\//i.test(googleReviewUrl)) {
      return NextResponse.json(
        { message: "Google口コミ投稿リンクは https:// から入力してください。" },
        { status: 400 },
      );
    }

    const scopedSchool = buildScopedSchoolFilter(
      accessResult.access,
      requestedSchoolId,
    );

    if (scopedSchool.effectiveSchoolId !== requestedSchoolId) {
      return NextResponse.json(
        { message: "この校舎のGoogle連携設定は変更できません。" },
        { status: 403 },
      );
    }

    const [school, setting] = await prisma.$transaction([
      prisma.school.update({
        where: { id: requestedSchoolId },
        data: {
          gbpLocationId: selectedGbpLocationId,
          ...(googleAccountId.startsWith("accounts/")
            ? { gbpAccountId: googleAccountId }
            : {}),
        },
        select: {
          id: true,
          name: true,
          gbpAccountId: true,
          gbpLocationId: true,
        },
      }),
      prisma.schoolSetting.upsert({
        where: { schoolId: requestedSchoolId },
        create: {
          schoolId: requestedSchoolId,
          googleConnected: true,
          googleAccountId: googleAccountId || null,
          selectedGbpLocationId,
          ...(hasReviewUrl ? { googleReviewUrl: googleReviewUrl || null } : {}),
          promptForbiddenWords: [],
          promptMustKeywords: [],
        },
        update: {
          googleConnected: true,
          selectedGbpLocationId,
          ...(googleAccountId ? { googleAccountId } : {}),
          ...(hasReviewUrl ? { googleReviewUrl: googleReviewUrl || null } : {}),
        },
        select: googleSettingSelect,
      }),
    ]);
    const serializedSetting = toSettingResponse(setting, requestedSchoolId);

    return NextResponse.json({
      success: true,
      school,
      setting: serializedSetting,
      account: toAccountResponse(serializedSetting),
    });
  } catch (error) {
    console.error("[POST /api/settings/google]", error);
    return NextResponse.json(
      { message: "Google連携設定を保存できませんでした。" },
      { status: 500 },
    );
  }
}
