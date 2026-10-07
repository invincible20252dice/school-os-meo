import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { isApprovedAccess } from "@/lib/access-control";
import { canAccessSchool } from "@/lib/auth-access";
export { POST } from "../rankings/route";

async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const access = await resolveRequestAccess(request, url);
    if (!access.isAuthenticated) return NextResponse.json({ success: false, error: "ログインしてください。" }, { status: 401 });
    if (!isApprovedAccess(access.access)) return NextResponse.json({ success: false, error: "承認が必要です。" }, { status: 403 });
    const schoolId = url.searchParams.get("schoolId");
    if (!schoolId || schoolId === "all") return NextResponse.json({ success: false, error: "校舎を選択してください。" }, { status: 400 });
    if (!canAccessSchool(access.access, schoolId)) return NextResponse.json({ success: false, error: "この校舎の操作権限がありません。" }, { status: 403 });
    if (request.method === "GET") return NextResponse.json({ success: true, keywords: await prisma.targetKeyword.findMany({ where: { schoolId, isActive: true }, orderBy: { createdAt: "asc" } }) });
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "キーワードIDが必要です。" }, { status: 400 });
    // Keep measurement and AIO history while removing the keyword from active lists.
    const result = await prisma.targetKeyword.updateMany({ where: { id, schoolId, isActive: true }, data: { isActive: false } });
    return NextResponse.json({ success: result.count > 0 }, { status: result.count ? 200 : 404 });
  } catch {
    return NextResponse.json({ success: false, error: "キーワードを取得・削除できませんでした。" }, { status: 500 });
  }
}
export const GET = handle;
export const DELETE = handle;
