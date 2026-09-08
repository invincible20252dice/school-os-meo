import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

const DEFAULT_INSTAGRAM_META_APP_ID = "4340844179393244";

type InstagramSettingPayload = {
  schoolId?: string;
  metaAppId?: string | null;
  metaAppSecret?: string | null;
  instagramMetaAppId?: string | null;
  instagramMetaAppSecret?: string | null;
  instagramBusinessAccountId?: string | null;
  businessAccountId?: string | null;
  instagramConnected?: boolean | null;
  autoSyncEnabled?: boolean | null;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSchoolId(value: unknown) {
  const schoolId = normalizeString(value);

  return schoolId === "all" ? "" : schoolId;
}

function toUpdatedAt(value?: Date | null) {
  return value ? value.toISOString().slice(0, 16).replace("T", " ") : "";
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

  if (status === 500) {
    console.error(fallbackMessage, error);
  }

  return NextResponse.json(
    {
      success: false,
      message:
        status === 400
          ? "Instagram設定を保存する校舎を選択してください。"
          : status === 403
            ? "この校舎のInstagram設定は変更できません。"
            : status === 404
              ? "対象校舎が見つかりませんでした。"
              : fallbackMessage,
      error: message || fallbackMessage,
    },
    { status },
  );
}

async function resolveWritableSchoolId(request: Request, bodySchoolId?: string) {
  const url = new URL(request.url);
  const requestedSchoolId =
    normalizeSchoolId(bodySchoolId) ||
    normalizeSchoolId(url.searchParams.get("schoolId"));
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

function serializeInstagramSetting({
  schoolId,
  instagramSetting,
  schoolSetting,
}: {
  schoolId: string;
  instagramSetting: {
    id?: string | null;
    metaAppId?: string | null;
    metaAppSecret?: string | null;
    instagramAccessToken?: string | null;
    instagramBusinessAccountId?: string | null;
    autoSyncEnabled?: boolean | null;
    lastSyncedAt?: Date | null;
    updatedAt?: Date | null;
  } | null;
  schoolSetting: {
    instagramConnected?: boolean | null;
    instagramMetaAppId?: string | null;
    instagramMetaAppSecret?: string | null;
    updatedAt?: Date | null;
  } | null;
}) {
  const metaAppId =
    instagramSetting?.metaAppId ||
    schoolSetting?.instagramMetaAppId ||
    DEFAULT_INSTAGRAM_META_APP_ID;
  const metaAppSecret =
    instagramSetting?.metaAppSecret || schoolSetting?.instagramMetaAppSecret || "";
  const businessAccountId = instagramSetting?.instagramBusinessAccountId || "";
  const hasAccessToken = Boolean(instagramSetting?.instagramAccessToken);
  const instagramConnected =
    Boolean(schoolSetting?.instagramConnected) ||
    Boolean(businessAccountId) ||
    hasAccessToken;

  return {
    id: instagramSetting?.id || "",
    schoolId,
    metaAppId,
    metaAppSecret,
    instagramMetaAppId: metaAppId,
    instagramMetaAppSecret: metaAppSecret,
    instagramConnected,
    instagramAccountName: businessAccountId ? "Instagram Business Account" : "",
    instagramUsername: businessAccountId ? "Instagram Business Account" : "アカウント未取得",
    instagramBusinessAccountId: businessAccountId,
    businessAccountId,
    businessAccountStatus: businessAccountId ? "CONNECTED" : "DISCONNECTED",
    businessAccountLabel: businessAccountId || "未取得",
    instagramAccessToken: hasAccessToken ? "********" : "",
    autoSyncEnabled: Boolean(instagramSetting?.autoSyncEnabled),
    status: instagramConnected ? "CONNECTED" : "DISCONNECTED",
    lastSyncedAt: toUpdatedAt(instagramSetting?.lastSyncedAt),
    updatedAt: toUpdatedAt(
      instagramSetting?.updatedAt || schoolSetting?.updatedAt || null,
    ),
  };
}

async function loadSetting(schoolId: string) {
  const [instagramSetting, schoolSetting] = await Promise.all([
    prisma.instagramSetting.findUnique({
      where: { schoolId },
      select: {
        id: true,
        metaAppId: true,
        metaAppSecret: true,
        instagramAccessToken: true,
        instagramBusinessAccountId: true,
        autoSyncEnabled: true,
        lastSyncedAt: true,
        updatedAt: true,
      },
    }),
    prisma.schoolSetting.findUnique({
      where: { schoolId },
      select: {
        instagramConnected: true,
        instagramMetaAppId: true,
        instagramMetaAppSecret: true,
        updatedAt: true,
      },
    }),
  ]);

  return serializeInstagramSetting({
    schoolId,
    instagramSetting,
    schoolSetting,
  });
}

export async function GET(request: Request) {
  try {
    const { school, access } = await resolveWritableSchoolId(request);
    const setting = await loadSetting(school.id);

    return NextResponse.json({
      success: true,
      school,
      setting,
      access: {
        role: access.role,
        effectiveSchoolId: school.id,
        source: access.source,
      },
    });
  } catch (error) {
    return toErrorResponse(error, "Instagram設定を取得できませんでした。");
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as InstagramSettingPayload;
    const { school, access } = await resolveWritableSchoolId(
      request,
      body.schoolId,
    );
    const current = await prisma.instagramSetting.findUnique({
      where: { schoolId: school.id },
      select: {
        instagramAccessToken: true,
        instagramBusinessAccountId: true,
        autoSyncEnabled: true,
      },
    });
    const metaAppId =
      normalizeString(body.metaAppId) ||
      normalizeString(body.instagramMetaAppId) ||
      DEFAULT_INSTAGRAM_META_APP_ID;
    const metaAppSecret =
      normalizeString(body.metaAppSecret) ||
      normalizeString(body.instagramMetaAppSecret);
    const instagramBusinessAccountId =
      normalizeString(body.instagramBusinessAccountId) ||
      normalizeString(body.businessAccountId) ||
      current?.instagramBusinessAccountId ||
      "";
    const autoSyncEnabled =
      body.autoSyncEnabled ?? current?.autoSyncEnabled ?? false;
    const instagramConnected =
      body.instagramConnected ?? Boolean(instagramBusinessAccountId);

    const instagramSetting = await prisma.instagramSetting.upsert({
      where: { schoolId: school.id },
      create: {
        schoolId: school.id,
        metaAppId,
        metaAppSecret,
        instagramAccessToken: current?.instagramAccessToken || "",
        instagramBusinessAccountId,
        autoSyncEnabled,
      },
      update: {
        metaAppId,
        metaAppSecret,
        instagramBusinessAccountId,
        autoSyncEnabled,
      },
      select: {
        id: true,
        metaAppId: true,
        metaAppSecret: true,
        instagramAccessToken: true,
        instagramBusinessAccountId: true,
        autoSyncEnabled: true,
        lastSyncedAt: true,
        updatedAt: true,
      },
    });
    const schoolSetting = await prisma.schoolSetting.upsert({
      where: { schoolId: school.id },
      create: {
        schoolId: school.id,
        instagramConnected,
        instagramMetaAppId: metaAppId,
        instagramMetaAppSecret: metaAppSecret,
      },
      update: {
        instagramConnected,
        instagramMetaAppId: metaAppId,
        instagramMetaAppSecret: metaAppSecret,
      },
      select: {
        instagramConnected: true,
        instagramMetaAppId: true,
        instagramMetaAppSecret: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      school,
      setting: serializeInstagramSetting({
        schoolId: school.id,
        instagramSetting,
        schoolSetting,
      }),
      access: {
        role: access.role,
        effectiveSchoolId: school.id,
        source: access.source,
      },
    });
  } catch (error) {
    return toErrorResponse(error, "Instagram設定を保存できませんでした。");
  }
}
