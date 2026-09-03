import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import {
  buildPromptSettingMutation,
  serializePromptSetting,
} from "@/lib/prompt-settings";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

const promptSettingSelect = {
  id: true,
  schoolId: true,
  promptSystemRole: true,
  promptReviewTone: true,
  promptMustKeywords: true,
  promptForbiddenWords: true,
  promptTargetLength: true,
  promptAutoReplyApproval: true,
  updatedAt: true,
};

const legacyPromptSettingSelect = {
  ...promptSettingSelect,
  promptTargetLength: false,
  promptAutoReplyApproval: false,
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSchoolId(value: unknown) {
  const schoolId = normalizeString(value);

  return schoolId === "all" ? "" : schoolId;
}

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

async function resolvePromptSchoolId(request: Request, bodySchoolId?: string) {
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

async function findPromptSetting(schoolId: string) {
  try {
    return await prisma.schoolSetting.findUnique({
      where: { schoolId },
      select: promptSettingSelect,
    });
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    console.error(
      "Prompt setting column lookup failed. Retrying with legacy columns.",
      error,
    );
    const setting = await prisma.schoolSetting.findUnique({
      where: { schoolId },
      select: legacyPromptSettingSelect,
    });

    return setting
      ? {
          ...setting,
          promptTargetLength: null,
          promptAutoReplyApproval: null,
        }
      : null;
  }
}

function toPromptErrorResponse(error: unknown) {
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
    console.error("プロンプト設定を処理できませんでした。", error);
  }

  return NextResponse.json(
    {
      success: false,
      message:
        status === 400
          ? "設定する校舎を選択してください。"
          : status === 403
            ? "この校舎のプロンプト設定は変更できません。"
            : status === 404
              ? "対象校舎が見つかりませんでした。"
              : "プロンプト設定を処理できませんでした。",
    },
    { status },
  );
}

export async function GET(request: Request) {
  try {
    const { school, access } = await resolvePromptSchoolId(request);
    const setting = await findPromptSetting(school.id);
    const serialized = serializePromptSetting(school.id, setting);

    return NextResponse.json({
      success: true,
      school,
      setting: serialized,
      access: {
        role: access.role,
        effectiveSchoolId: school.id,
        source: access.source,
      },
    });
  } catch (error) {
    return toPromptErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { school, access } = await resolvePromptSchoolId(
      request,
      body.schoolId,
    );
    const data = buildPromptSettingMutation(body);
    const updated = await prisma.schoolSetting.upsert({
      where: { schoolId: school.id },
      create: {
        schoolId: school.id,
        ...data,
      },
      update: data,
      select: promptSettingSelect,
    });

    return NextResponse.json({
      success: true,
      school,
      setting: serializePromptSetting(school.id, updated),
      access: {
        role: access.role,
        effectiveSchoolId: school.id,
        source: access.source,
      },
    });
  } catch (error) {
    return toPromptErrorResponse(error);
  }
}

export const PATCH = POST;
