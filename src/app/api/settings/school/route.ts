import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { buildEmptySchoolSetting, type NullableSchoolSettingState } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

type SchoolSettingPayload = Partial<NullableSchoolSettingState> & {
  schoolId?: string;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => normalizeString(item)).filter(Boolean)
    : [];
}

function toUpdatedAt(value?: Date) {
  return value ? value.toISOString().slice(0, 16).replace("T", " ") : "";
}

function serializeSetting({
  schoolId,
  schoolSetting,
  instagramSetting,
}: {
  schoolId: string;
  schoolSetting: {
    id: string;
    schoolId: string;
    googleConnected: boolean;
    googleAccountId: string | null;
    googleRefreshToken: string | null;
    selectedGbpLocationId: string | null;
    lineNotifyEnabled: boolean;
    lineChannelAccessToken: string | null;
    lineDestinationId: string | null;
    notifyOnNewReview: boolean;
    notifyOnLowRating: boolean;
    instagramConnected: boolean;
    instagramMetaAppId: string | null;
    instagramMetaAppSecret: string | null;
    promptSystemRole: string | null;
    promptReviewTone: string;
    promptForbiddenWords: string[];
    promptMustKeywords: string[];
    updatedAt: Date;
  } | null;
  instagramSetting: {
    metaAppId: string | null;
    metaAppSecret: string | null;
    instagramAccessToken: string;
    instagramBusinessAccountId: string;
    updatedAt: Date;
  } | null;
}) {
  const fallback = buildEmptySchoolSetting(schoolId);

  if (!schoolSetting && !instagramSetting) {
    return fallback;
  }

  return {
    ...fallback,
    id: schoolSetting?.id || fallback.id,
    schoolId,
    googleConnected: schoolSetting?.googleConnected ?? fallback.googleConnected,
    googleAccountId: schoolSetting?.googleAccountId || "",
    googleRefreshToken: schoolSetting?.googleRefreshToken ? "********" : "",
    selectedGbpLocationId: schoolSetting?.selectedGbpLocationId || "",
    lineNotifyEnabled:
      schoolSetting?.lineNotifyEnabled ?? fallback.lineNotifyEnabled,
    lineChannelAccessToken: schoolSetting?.lineChannelAccessToken || "",
    lineDestinationId: schoolSetting?.lineDestinationId || "",
    notifyOnNewReview:
      schoolSetting?.notifyOnNewReview ?? fallback.notifyOnNewReview,
    notifyOnLowRating:
      schoolSetting?.notifyOnLowRating ?? fallback.notifyOnLowRating,
    instagramConnected:
      schoolSetting?.instagramConnected ||
      Boolean(instagramSetting?.instagramBusinessAccountId),
    instagramMetaAppId:
      schoolSetting?.instagramMetaAppId || instagramSetting?.metaAppId || "",
    instagramMetaAppSecret:
      schoolSetting?.instagramMetaAppSecret ||
      instagramSetting?.metaAppSecret ||
      "",
    instagramBusinessAccountId:
      instagramSetting?.instagramBusinessAccountId || "",
    instagramAccessToken: instagramSetting?.instagramAccessToken ? "********" : "",
    promptSystemRole: schoolSetting?.promptSystemRole || "",
    promptReviewTone: schoolSetting?.promptReviewTone || fallback.promptReviewTone,
    promptForbiddenWords: schoolSetting?.promptForbiddenWords || [],
    promptMustKeywords: schoolSetting?.promptMustKeywords || [],
    updatedAt: toUpdatedAt(
      schoolSetting?.updatedAt || instagramSetting?.updatedAt || undefined,
    ),
  };
}

async function resolveWritableSchoolId(request: Request, bodySchoolId?: string) {
  const url = new URL(request.url);
  const requestedSchoolId =
    normalizeString(bodySchoolId) || normalizeString(url.searchParams.get("schoolId"));
  const accessResult = await resolveRequestAccess(request, url);

  if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
    throw new Error("FORBIDDEN_PENDING");
  }

  const scopedSchool = buildScopedSchoolFilter(
    accessResult.access,
    requestedSchoolId,
  );
  const schoolId = scopedSchool.effectiveSchoolId || requestedSchoolId;

  if (!schoolId) {
    throw new Error("SCHOOL_REQUIRED");
  }

  if (requestedSchoolId && schoolId !== requestedSchoolId) {
    throw new Error("FORBIDDEN_SCHOOL");
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, status: true },
  });

  if (!school || school.status !== "ACTIVE") {
    throw new Error("SCHOOL_NOT_FOUND");
  }

  return {
    school,
    access: accessResult.access,
  };
}

function toErrorResponse(error: unknown, fallbackMessage: string) {
  const message = error instanceof Error ? error.message : "";
  const status =
    message === "SCHOOL_REQUIRED"
      ? 400
      : message === "FORBIDDEN_PENDING" || message === "FORBIDDEN_SCHOOL"
        ? 403
        : message === "SCHOOL_NOT_FOUND"
          ? 404
          : 500;

  return NextResponse.json(
    {
      message:
        status === 400
          ? "設定を保存する校舎を選択してください。"
          : status === 403
            ? "この校舎の設定は変更できません。"
            : status === 404
              ? "対象校舎が見つかりませんでした。"
              : fallbackMessage,
    },
    { status },
  );
}

export async function GET(request: Request) {
  try {
    const { school, access } = await resolveWritableSchoolId(request);
    const [schoolSetting, instagramSetting] = await Promise.all([
      prisma.schoolSetting.findUnique({
        where: { schoolId: school.id },
      }),
      prisma.instagramSetting.findUnique({
        where: { schoolId: school.id },
        select: {
          metaAppId: true,
          metaAppSecret: true,
          instagramAccessToken: true,
          instagramBusinessAccountId: true,
          updatedAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      school,
      setting: serializeSetting({
        schoolId: school.id,
        schoolSetting,
        instagramSetting,
      }),
      access: {
        role: access.role,
        effectiveSchoolId: school.id,
        source: access.source,
      },
    });
  } catch (error) {
    return toErrorResponse(error, "校舎設定を取得できませんでした。");
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as SchoolSettingPayload;
    const { school, access } = await resolveWritableSchoolId(
      request,
      body.schoolId,
    );
    const current = await prisma.schoolSetting.findUnique({
      where: { schoolId: school.id },
      select: { googleRefreshToken: true },
    });
    const setting = await prisma.schoolSetting.upsert({
      where: { schoolId: school.id },
      create: {
        schoolId: school.id,
        googleConnected: Boolean(body.googleConnected),
        googleAccountId: normalizeString(body.googleAccountId),
        googleRefreshToken: current?.googleRefreshToken || null,
        selectedGbpLocationId: normalizeString(body.selectedGbpLocationId),
        lineNotifyEnabled: body.lineNotifyEnabled ?? true,
        lineChannelAccessToken: normalizeString(body.lineChannelAccessToken),
        lineDestinationId: normalizeString(body.lineDestinationId),
        notifyOnNewReview: body.notifyOnNewReview ?? true,
        notifyOnLowRating: body.notifyOnLowRating ?? true,
        instagramConnected: Boolean(body.instagramConnected),
        instagramMetaAppId: normalizeString(body.instagramMetaAppId),
        instagramMetaAppSecret: normalizeString(body.instagramMetaAppSecret),
        promptSystemRole: normalizeString(body.promptSystemRole),
        promptReviewTone: normalizeString(body.promptReviewTone) || "FRIENDLY",
        promptForbiddenWords: normalizeStringList(body.promptForbiddenWords),
        promptMustKeywords: normalizeStringList(body.promptMustKeywords),
      },
      update: {
        googleConnected: Boolean(body.googleConnected),
        googleAccountId: normalizeString(body.googleAccountId),
        selectedGbpLocationId: normalizeString(body.selectedGbpLocationId),
        lineNotifyEnabled: body.lineNotifyEnabled ?? true,
        lineChannelAccessToken: normalizeString(body.lineChannelAccessToken),
        lineDestinationId: normalizeString(body.lineDestinationId),
        notifyOnNewReview: body.notifyOnNewReview ?? true,
        notifyOnLowRating: body.notifyOnLowRating ?? true,
        instagramConnected: Boolean(body.instagramConnected),
        instagramMetaAppId: normalizeString(body.instagramMetaAppId),
        instagramMetaAppSecret: normalizeString(body.instagramMetaAppSecret),
        promptSystemRole: normalizeString(body.promptSystemRole),
        promptReviewTone: normalizeString(body.promptReviewTone) || "FRIENDLY",
        promptForbiddenWords: normalizeStringList(body.promptForbiddenWords),
        promptMustKeywords: normalizeStringList(body.promptMustKeywords),
      },
    });
    const instagramSetting = await prisma.instagramSetting.findUnique({
      where: { schoolId: school.id },
      select: {
        metaAppId: true,
        metaAppSecret: true,
        instagramAccessToken: true,
        instagramBusinessAccountId: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      school,
      setting: serializeSetting({
        schoolId: school.id,
        schoolSetting: setting,
        instagramSetting,
      }),
      access: {
        role: access.role,
        effectiveSchoolId: school.id,
        source: access.source,
      },
    });
  } catch (error) {
    return toErrorResponse(error, "校舎設定を保存できませんでした。");
  }
}
