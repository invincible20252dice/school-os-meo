import { NextResponse } from "next/server";
import { buildLookerStudioRows } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";

function isAuthorized(request: Request) {
  const secret = process.env.ANALYTICS_API_SECRET;

  if (!secret) {
    return true;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const ownerId = url.searchParams.get("ownerId");
  const requestedSchoolId = url.searchParams.get("schoolId") || undefined;

  try {
    const { access, isAuthenticated } = await resolveRequestAccess(request, url);
    const scopedSchool = buildScopedSchoolFilter(access, requestedSchoolId);
    const effectiveOwnerId = isAuthenticated ? access.userId : ownerId;

    if (!effectiveOwnerId) {
      return NextResponse.json(
        { message: "ownerId is required." },
        { status: 400 },
      );
    }

    const rows = await buildLookerStudioRows(prisma, {
      ownerId: effectiveOwnerId,
      schoolId: scopedSchool.effectiveSchoolId,
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
    });

    return NextResponse.json({
      rows,
      access: {
        requestedSchoolId: scopedSchool.requestedSchoolId,
        effectiveSchoolId: scopedSchool.effectiveSchoolId || "all",
        role: scopedSchool.role,
        source: access.source,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "GBPインサイト分析データの取得に失敗しました。" },
      { status: 500 },
    );
  }
}
