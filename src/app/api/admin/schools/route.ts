import { NextResponse } from "next/server";
import { canManageUsers } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import { resolveRequestAccess } from "@/lib/supabase-access";

const SYSTEM_USER_ID = "system-user";
const SYSTEM_USER_EMAIL = "system@school-os.local";

type SchoolPayload = {
  schoolId?: string;
  name?: string;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function assertAdminAccess(request: Request) {
  const result = await resolveRequestAccess(request, new URL(request.url));

  if (!result.isAuthenticated) {
    throw new Error("UNAUTHENTICATED");
  }

  if (!canManageUsers(result.access)) {
    throw new Error("FORBIDDEN");
  }
}

function toAdminErrorResponse(error: unknown, fallbackMessage: string) {
  const status =
    error instanceof Error && error.message === "UNAUTHENTICATED"
      ? 401
      : error instanceof Error && error.message === "FORBIDDEN"
        ? 403
        : 500;

  return NextResponse.json(
    {
      message:
        status === 401
          ? "ログイン後に校舎管理を利用できます。"
          : status === 403
            ? "校舎管理は本部管理者のみ利用できます。"
            : fallbackMessage,
    },
    { status },
  );
}

async function ensureSystemOwner() {
  return prisma.user.upsert({
    where: { id: SYSTEM_USER_ID },
    update: {
      name: "システム",
      role: "HEADQUARTERS",
    },
    create: {
      id: SYSTEM_USER_ID,
      email: SYSTEM_USER_EMAIL,
      name: "システム",
      role: "HEADQUARTERS",
    },
    select: { id: true },
  });
}

export async function GET(request: Request) {
  try {
    await assertAdminAccess(request);
    const schools = await prisma.school.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true },
    });

    return NextResponse.json({ schools });
  } catch (error) {
    return toAdminErrorResponse(error, "校舎一覧を取得できませんでした。");
  }
}

export async function POST(request: Request) {
  try {
    await assertAdminAccess(request);
    const body = (await request.json()) as SchoolPayload;
    const name = normalizeString(body.name);

    if (!name) {
      return NextResponse.json(
        { message: "校舎名を入力してください。" },
        { status: 400 },
      );
    }

    const owner = await ensureSystemOwner();
    const school = await prisma.school.create({
      data: {
        ownerId: owner.id,
        name,
        brandName: name,
        googlePlaceId: `manual-${crypto.randomUUID()}`,
        googleMapsUrl: "https://search.google.com/local/writereview",
        status: "ACTIVE",
      },
      select: { id: true, name: true },
    });

    return NextResponse.json({ school }, { status: 201 });
  } catch (error) {
    return toAdminErrorResponse(error, "校舎を追加できませんでした。");
  }
}

export async function PATCH(request: Request) {
  try {
    await assertAdminAccess(request);
    const body = (await request.json()) as SchoolPayload;
    const schoolId = normalizeString(body.schoolId);
    const name = normalizeString(body.name);

    if (!schoolId || !name) {
      return NextResponse.json(
        { message: "校舎IDと校舎名を確認してください。" },
        { status: 400 },
      );
    }

    const school = await prisma.school.update({
      where: { id: schoolId },
      data: {
        name,
        brandName: name,
      },
      select: { id: true, name: true },
    });

    return NextResponse.json({ school });
  } catch (error) {
    return toAdminErrorResponse(error, "校舎名を更新できませんでした。");
  }
}

export async function DELETE(request: Request) {
  try {
    await assertAdminAccess(request);
    const body = (await request.json()) as SchoolPayload;
    const schoolId = normalizeString(body.schoolId);

    if (!schoolId) {
      return NextResponse.json(
        { message: "削除する校舎を確認してください。" },
        { status: 400 },
      );
    }

    const school = await prisma.school.update({
      where: { id: schoolId },
      data: { status: "ARCHIVED" },
      select: { id: true, name: true },
    });

    return NextResponse.json({ school });
  } catch (error) {
    return toAdminErrorResponse(error, "校舎を削除できませんでした。");
  }
}
