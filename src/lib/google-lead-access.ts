import { NextResponse } from "next/server";
import { isApprovedAccess } from "./access-control";
import { canAccessSchool } from "./auth-access";
import { resolveRequestAccess } from "./supabase-access";
import { prisma } from "./prisma";
import { LeadError, leadObject } from "./google-leads";

export const leadHeaders = { "Cache-Control": "private, no-store" };
export async function leadScope(request: Request) {
  const url = new URL(request.url);
  const { access, isAuthenticated } = await resolveRequestAccess(request, url);
  if (!isAuthenticated) throw new LeadError("ログインしてください。", 401);
  if (!isApprovedAccess(access)) throw new LeadError("アカウントの承認が必要です。", 403);
  const schoolId = url.searchParams.get("schoolId");
  if (!schoolId || schoolId === "all") throw new LeadError("対象の校舎を選択してください。");
  if (!canAccessSchool(access, schoolId)) throw new LeadError("この校舎へのアクセス権限がありません。", 403);
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } });
  if (!school) throw new LeadError("校舎が見つかりません。", 404);
  return { school, url };
}
export async function leadBody(request: Request) {
  try { return leadObject(await request.json()); } catch { throw new LeadError("入力内容を確認してください。"); }
}
export function leadFailure(error: unknown) {
  if (error instanceof LeadError) return NextResponse.json({ success: false, error: error.message }, { status: error.status, headers: leadHeaders });
  console.error("[Google leads] Storage or request failure");
  return NextResponse.json({ success: false, error: "記録を取得・保存できませんでした。もう一度お試しください。" }, { status: 503, headers: leadHeaders });
}
