import { NextResponse } from "next/server";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { isApprovedAccess } from "@/lib/access-control";
import { canAccessSchool } from "@/lib/auth-access";
import { loadSearchKeywords, previousKeywordMonth } from "@/lib/google-search-keywords";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const { access, isAuthenticated } = await resolveRequestAccess(request, url);
  if (!isAuthenticated) return NextResponse.json({ success: false }, { status: 401 });
  const schoolId = url.searchParams.get("schoolId");
  if (!isApprovedAccess(access) || !schoolId || schoolId === "all" || !canAccessSchool(access, schoolId)) return NextResponse.json({ success: false }, { status: 403 });
  const month = url.searchParams.get("month") ?? previousKeywordMonth();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > previousKeywordMonth()) return NextResponse.json({ success: false, error: "完了済みの月をYYYY-MMで指定してください。" }, { status: 400 });
  const result = await loadSearchKeywords(schoolId, month);
  return NextResponse.json({ success: result.status === "AVAILABLE" || result.status === "EMPTY", ...result }, { headers: { "Cache-Control": "private, no-store" } });
}
