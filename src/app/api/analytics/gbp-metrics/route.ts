import { NextResponse } from "next/server";
import {
  resolveEffectiveSchoolIdForRequest,
  type AuthRole,
} from "@/lib/auth-access";
import { buildLookerStudioRows } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";

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
  const role =
    (request.headers.get("x-user-role") ||
      url.searchParams.get("role") ||
      "admin") as AuthRole;
  const userSchoolId =
    request.headers.get("x-user-school-id") ||
    url.searchParams.get("userSchoolId") ||
    "";
  const requestedSchoolId = url.searchParams.get("schoolId") || undefined;
  const effectiveSchoolId = resolveEffectiveSchoolIdForRequest(
    {
      userId: ownerId || "demo-user",
      role,
      schoolId: userSchoolId,
      schoolIds: userSchoolId ? [userSchoolId] : [],
    },
    requestedSchoolId,
  );

  if (!ownerId) {
    return NextResponse.json(
      { message: "ownerId is required." },
      { status: 400 },
    );
  }

  try {
    const rows = await buildLookerStudioRows(prisma, {
      ownerId,
      schoolId: effectiveSchoolId,
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
    });

    return NextResponse.json({
      rows,
      access: {
        requestedSchoolId: requestedSchoolId || "all",
        effectiveSchoolId: effectiveSchoolId || "all",
        role,
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
