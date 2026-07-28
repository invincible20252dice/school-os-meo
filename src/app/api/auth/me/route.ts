import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { resolveRequestAccess } from "@/lib/supabase-access";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await resolveRequestAccess(request, url);

    return NextResponse.json({
      authenticated: result.isAuthenticated,
      approved: result.isAuthenticated ? isApprovedAccess(result.access) : true,
      access: {
        userId: result.access.userId,
        role: result.access.role,
        schoolId: result.access.schoolId || "",
        schoolIds: result.access.schoolIds,
        name: result.access.name,
        email: result.access.email,
        status: result.access.status,
        source: result.access.source,
      },
    });
  } catch {
    return NextResponse.json(
      {
        authenticated: false,
        approved: false,
        message: "ログイン状態を確認できませんでした。",
      },
      { status: 401 },
    );
  }
}
