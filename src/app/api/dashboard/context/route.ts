import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { buildDashboardContext } from "@/lib/dashboard-context";
import { prisma } from "@/lib/prisma";
import { resolveRequestAccess } from "@/lib/supabase-access";

function scopedSchoolWhere(access: Awaited<ReturnType<typeof resolveRequestAccess>>["access"]) {
  if (["admin", "owner", "HEADQUARTERS"].includes(access.role)) {
    return { status: "ACTIVE" as const };
  }

  const schoolIds = access.schoolIds.length
    ? access.schoolIds
    : access.schoolId
      ? [access.schoolId]
      : [];

  return {
    status: "ACTIVE" as const,
    id: { in: schoolIds },
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const accessResult = await resolveRequestAccess(request, url);

    if (accessResult.isAuthenticated && !isApprovedAccess(accessResult.access)) {
      return NextResponse.json(
        { message: "アカウント承認後に校舎を選択できます。" },
        { status: 403 },
      );
    }

    const schools = await prisma.school.findMany({
      where: scopedSchoolWhere(accessResult.access),
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true },
    });

    return NextResponse.json(
      buildDashboardContext({
        access: accessResult.access,
        schools,
        requestedSchoolId: url.searchParams.get("schoolId"),
      }),
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "校舎情報を取得できませんでした。" },
      { status: 500 },
    );
  }
}
